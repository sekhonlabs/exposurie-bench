---
id: dev-26
user: developer
at: 2026-09-10T15:20:00+01:00
surface: vscode
project: tidewell-api
kind: distractor
---

## User

I bumped our shared events package this afternoon and `npm run typecheck` now fails in `src/handlers/invoice-events.ts`:

```
src/handlers/invoice-events.ts:41:28 - error TS2339: Property 'invoiceId' does not exist on type 'ApiEvent'.
  Property 'invoiceId' does not exist on type 'UnknownEvent'.
```

The handler does `switch (event.type)` with `case "invoice.paid":` and reads `event.payload.invoiceId` inside it. It narrowed fine before the bump. I don't want a workaround until I understand why the narrowing stopped. Please find the cause first, then propose a fix. Don't touch the lockfile.

## Assistant

I'll look at the handler and at the type definitions the bumped package now ships.

Found it. The cause is in the package's declaration file, not in your handler. The new version changed `ApiEvent` from this:

```ts
type ApiEvent = InvoicePaid | InvoiceVoided;
```

to this:

```ts
type ApiEvent = InvoicePaid | InvoiceVoided | UnknownEvent;
// UnknownEvent = { type: string; payload: unknown }
```

TypeScript can only narrow a union with `switch (event.type)` when every member's `type` is a literal. `UnknownEvent.type` is plain `string`, so `"invoice.paid"` also matches `UnknownEvent`. Inside the case, `event` is still `InvoicePaid | UnknownEvent`, and `payload` on the second one is `unknown`, hence `invoiceId` is missing.

The package is being honest about forward compatibility: the API can now send event types the client doesn't know. Your handler has to prove which shape it has before reading the payload.

I'd write a small type guard rather than loosen anything. Do you want me to go ahead?

## User

Not yet. I'd guess you're about to suggest `event as InvoicePaid`. Don't. A cast is exactly what hides the problem the package is warning about. The next time they widen a payload, the cast keeps compiling and we find out in production. A guard that checks the shape at runtime is the only version I accept.

Also, my first instinct was to pin the previous version. Check the changelog in the package first. If the old narrowing was an accident, I'll drop the pin idea.

## Assistant

I wasn't going to propose the cast, but I agree that it's the wrong tool here.

I checked the changelog in the package folder under `node_modules`. The entry for this version says the catch-all member was added deliberately: older clients threw on unrecognised event types, and the maintainers call that behaviour a bug. So the old narrowing only worked because the union was incomplete. Pinning would restore the incompleteness, not a correct type.

Here is the guard I'd add in `src/handlers/invoice-events.ts`:

```ts
function isInvoicePaid(event: ApiEvent): event is InvoicePaid {
  return (
    event.type === "invoice.paid" &&
    typeof event.payload === "object" &&
    event.payload !== null &&
    typeof (event.payload as { invoiceId?: unknown }).invoiceId === "string"
  );
}
```

The one assertion inside is on a value already checked to be a non-null object, and it only feeds a `typeof` test. It never leaks out as a trusted type. The switch then becomes an `if (isInvoicePaid(event))` branch, and the fallthrough logs the unknown type and returns.

## User

Good, and the changelog settles it: no pin. One objection to the shape of your guard. You wrote it for `invoice.paid` only. The handler also has the `invoice.voided` case, and I don't want two guards that drift apart. Can both share one helper that checks the common part, a non-null object payload with a string `invoiceId`, and then each guard adds only its own literal?

## Assistant

Yes, the two events share the same payload prefix, so one helper is cleaner. I've made these changes:

- Added `hasInvoiceId(payload: unknown): payload is { invoiceId: string }` at the top of `invoice-events.ts`. It does the object, null and string checks once.
- Rewrote `isInvoicePaid` as `event.type === "invoice.paid" && hasInvoiceId(event.payload)`.
- Added `isInvoiceVoided` the same way, with its own literal.
- Replaced the `switch` with two guarded branches plus a final fallthrough that logs `event.type` at warn level and returns without throwing. That matches the package's intent that unknown events are survivable.

I didn't export the guards, since nothing else imports them. Say so if you want them in a shared module.

I'm running the checks now.

## User

Keep them local. Run the whole thing, not just the one file.

## Assistant

Results:

- `npm run typecheck`: clean, zero errors. The TS2339 is gone.
- `npm run lint`: one Prettier complaint in my edit, a line over the width limit in `hasInvoiceId`. I fixed it with the team config and reran: clean.
- `npx jest`: all suites pass, 48 tests in 9 suites.

One gap: no existing test sends an event with an unrecognised `type`, so the new fallthrough has no coverage. I'd add a case to `invoice-events.test.ts` that passes `{ type: "invoice.archived", payload: {} }` and asserts the handler resolves and logs a warning. I haven't written it, since you asked for the fix only.

## User

Add that test. The fallthrough is the new behaviour, so it should be covered. Then I'm done.

## Assistant

Added to `src/handlers/invoice-events.test.ts`: a test named "ignores unrecognised event types" that sends `{ type: "invoice.archived", payload: {} }`. It asserts the handler resolves without throwing and that the warn logger is called once with the event type. I also added a second test where `invoice.paid` arrives with a numeric `invoiceId`. It asserts the handler takes the fallthrough, which shows the guard checks the payload shape and not just the literal.

Reran `npx jest`: 50 tests in 9 suites, all passing. Typecheck and lint are still clean.

Changed files: `src/handlers/invoice-events.ts` and `src/handlers/invoice-events.test.ts`. The lockfile is untouched.
