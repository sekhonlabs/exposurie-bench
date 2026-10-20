---
id: dev-08
user: developer
at: 2026-06-11T11:40:00+01:00
surface: vscode
project: tidewell-api
kind: distractor
---

## User

The Jest test for session expiry in tidewell-api is flaky and I want it fixed properly. It's `src/auth/session.test.ts`, the case called "rejects a session after its ttl". It fails roughly one run in ten, on CI and locally, always with the same assertion: `expect(isExpired(session)).toBe(true)` receives `false`. It never fails the other way round, so a still-valid session is never reported as expired.

Please don't touch anything yet. First find out why it fails, and tell me what you found before you change code. My suspicion is that fake timers are involved, because that test calls `jest.useFakeTimers()` in a `beforeEach`. But I haven't proven it.

## Assistant

I'll read the test, the session module and the Jest config, and then run the test in a loop to reproduce the failure.



Reading is done and I have a reproduction.

**Reproduction.** I ran `npx jest src/auth/session.test.ts -t "rejects a session after its ttl"` 100 times in a loop. It failed 9 times, always with `Expected: true, Received: false` at the `isExpired` assertion. That matches your one-in-ten.

**Cause.** Your suspicion is right, but the problem is narrower than "fake timers are flaky". Two things combine:

1. `src/auth/clock.ts` starts with `const realNow = Date.now.bind(Date)` at module scope and exports `export const now = () => realNow()`. That binds to the real `Date.now` when the module is first imported, which happens before `jest.useFakeTimers()` runs in `beforeEach`. Fake timers replace `Date` on the global, but `realNow` still points at the original function, so everything that goes through `clock.now()` keeps reading real time.
2. The test builds the session with `createSession({ ttlMs: 1000 })`, which stamps `createdAt` through `clock.now()`, so it is real time. It then calls `jest.advanceTimersByTime(1000)` and checks `isExpired(session)`. That function reads the time through `clock.now()` too, so the faked clock never moves.

That means the test only passes when the real wall clock happens to cross the 1000 ms boundary between those two calls. Setup, a Prisma client stub and a few awaits run in between, and they usually take a bit over a millisecond. Usually, but not always. On a run where the whole sequence finishes in under 1 ms, the session is not yet expired. The failure rate depends on machine speed, which is why it looks random.

So the test is not asserting anything about fake time. It passes through real elapsed time by accident.

**What I haven't done.** I haven't changed any files. I see two parts to a fix:

- In the test, set the system time explicitly with `jest.setSystemTime(...)` so every run starts from the same instant.
- In `clock.ts`, read `Date.now()` at call time instead of capturing it at import, so the fake timers actually control it.

Do you want both, or only the test change?

## User

Good, that's the kind of explanation I wanted. Two things before you go ahead.

First, I'm not changing `clock.ts` just because the test is awkward. That module is used by the token refresh path and the rate limiter, and I want to know why it captures `Date.now` at import before I touch it. Check `git log` and `git blame` on that line. If there is a real reason, such as something deliberately ignoring mocked time, I want to hear it before we remove it.

Second, don't reach for `jest.retryTimes(3)` or anything like it. I've seen teams "fix" flakiness that way, and all it does is hide a test that is wrong. I know you didn't suggest it, but it's the usual default and I'm saying no up front.

## Assistant

Understood on both. I'll check the history of that line first.



Here is what the history shows.

- The line comes from a commit titled "Bind Date.now once in clock helper", the first commit that added `clock.ts`. The message body says only "avoid repeated property lookup in hot path". There is no linked ticket key and no comment in the file.
- `git log -S "realNow"` shows the line was never touched again, and the file has only one other change, which was a rename.
- I searched for usages. `now` is imported in 14 places: the token refresh path, the rate limiter, the session module and its tests, and a few others. None of them expect real time while fake timers are on. Two other test files already call `jest.useFakeTimers()` and then `jest.setSystemTime(...)`, and both contain a comment saying "clock helper ignores this, assert on relative values only". So other people have worked around the same problem.
- Nothing in the code or the commit suggests the capture is deliberate behaviour. The stated reason is a micro-optimisation. Looking up `Date.now` once per call costs nanoseconds and won't register next to a Prisma query.

So I found no reason to keep the capture. It looks like an optimisation nobody measured, and it has made time impossible to fake.

I would change it to:

```ts
export const now = (): number => Date.now()
```

The signature and every caller stay the same. The only difference is that the global `Date` is looked up when `now()` is called, which is what fake timers need.

Do you want me to go ahead with that, plus `jest.setSystemTime` in the session test?

## User

Fine, you've changed my mind on the helper. The history shows no deliberate reason, and the two workaround comments are the evidence I was missing. Make the change.

For the test, I want the start time to be explicit and fixed, not `new Date()`. Use 2026-06-11T11:40:00Z. Then the test sets up the session, advances by exactly the ttl minus one millisecond, asserts the session is still valid, advances by one more millisecond and asserts it's expired. Both sides of the boundary, so it can't pass by accident the way it does now. Also call `jest.useRealTimers()` in `afterEach` so the fake clock can't leak into the other tests in that file.

## Assistant

Done. These are the changes.

**`src/auth/clock.ts`**: replaced the import-time capture with `export const now = (): number => Date.now()`. I removed the `realNow` constant. No caller changed.

**`src/auth/session.test.ts`**: the case now reads like this:

```ts
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-06-11T11:40:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

it('rejects a session after its ttl', () => {
  const session = createSession({ ttlMs: 1000 })

  jest.advanceTimersByTime(999)
  expect(isExpired(session)).toBe(false)

  jest.advanceTimersByTime(1)
  expect(isExpired(session)).toBe(true)
})
```

Things I checked along the way:

- `isExpired` uses `>=` against `createdAt + ttlMs`, so a session is expired exactly at 1000 ms. The two assertions therefore sit on either side of the boundary, as you asked.
- The other tests in `session.test.ts` didn't depend on the old behaviour. One of them called `jest.useFakeTimers()` in its own body, which is now redundant, so I left it alone and it does no harm.
- I ran the other two files that use `jest.setSystemTime`. They still pass, and I haven't touched their workaround comments. Those comments are now out of date, but I thought the cleanup belonged in a separate change.

I'll run the full `src/auth` folder once before the loop, to catch any regressions the clock change might cause elsewhere.


Result: 6 suites, 41 tests, all passing. That includes the token refresh and rate limiter suites, which also import `now` from `clock.ts`.

## User

Good. Now the confirmation run. I want 100 consecutive runs of that specific test, and I want it to stop at the first failure so I see the real output rather than a summary. Run it with `--runInBand` so parallel workers don't change the timing, and report exactly how many passed.

Also run the same loop against the old version of the test and the old `clock.ts` with a stash, if you can do that cleanly. I want to see it fail in the same loop before I believe it passes now.

## Assistant

I'll do the old version first, so the loop is shown to catch the failure before I trust it on the fix.



**Before the fix** (changes stashed): the loop stopped at run 7 with the same assertion failure, `Expected: true, Received: false` at the `isExpired` line. A second attempt stopped at run 13. The loop does catch the flake.

I then restored the stash, confirmed with `git status` that the two files were modified again, and ran the confirmation loop:

```
for i in $(seq 1 100); do
  npx jest src/auth/session.test.ts -t "rejects a session after its ttl" --runInBand --silent || { echo "failed on run $i"; break; }
done
```

**After the fix**: 100 of 100 runs passed, and the loop never printed `failed on run`. I also ran the whole `session.test.ts` file 100 times the same way, so the `afterEach` reset is covered along with the single case, and that gave 100 of 100 as well.

One caveat is that a passing loop shows the failure rate is far below 1 in 10, not that it is zero. The reason it should be zero is structural. The test no longer reads real time, since `now()` goes through the faked `Date` and the start time is set explicitly. That is a stronger argument than the loop.

Current state, uncommitted: `src/auth/clock.ts` and `src/auth/session.test.ts` are modified, and nothing else is.

## User

That's what I needed. One more point on the stale workaround comments in those two other test files. You said you'd leave them for a separate change. I disagree, but only a little. A comment saying "clock helper ignores this" is now false, and a false comment is worse than none. Remove just those two comments. Don't change the assertions beneath them. They're relative-value assertions, and I don't want this fix to touch their behaviour.

After that, give me a short summary I can paste into the pull request, covering what was wrong, what changed, and how it was verified. Keep it factual.

## Assistant

Fair point. A comment that is now wrong would mislead the next reader, so I've removed both. I changed only those lines. The assertions beneath them are untouched, and I re-ran both files afterwards and they pass.

Here is a summary you can paste:

**What was wrong.** `src/auth/clock.ts` bound `Date.now` when the module was first imported, so `now()` kept returning real time after `jest.useFakeTimers()` replaced the global `Date`. The session expiry test then compared a real-time `createdAt` with a real-time check. It passed only when real elapsed time happened to cross the ttl, which is why it failed about one run in ten.

**What changed.**
- `clock.ts`: `now()` calls `Date.now()` at call time, with the same signature and no change to callers. Git history shows the import-time binding was a micro-optimisation with no stated behavioural purpose.
- `session.test.ts`: fixed start time via `jest.setSystemTime(new Date('2026-06-11T11:40:00Z'))`, assertions on both sides of the ttl boundary (999 ms still valid, 1000 ms expired), and `jest.useRealTimers()` in `afterEach`.
- Removed two comments in other test files that said the clock helper ignores mocked time. They were true before this change and are false now. Their assertions are unchanged.

**How it was verified.** The old code failed the same loop at runs 7 and 13. With the fix, 100 of 100 consecutive runs passed using `--runInBand`, for both the single case and the whole file. The `src/auth` suites all pass: 6 suites, 41 tests.
