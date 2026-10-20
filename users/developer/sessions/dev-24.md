---
id: dev-24
user: developer
at: 2026-09-01T10:30:00+01:00
surface: vscode
project: tidewell-infra
kind: build
---

## User

Last night's production deploy raised the API's error rate. The 5xx share on the public endpoints went from roughly 0.2% to about 4% starting a few minutes after the deploy finished, and it hasn't come down. I'm on call this week (one week in six, so I'd like to get this right the first time), and I want to roll back rather than debug live.

My understanding is that a rollback here runs the promote workflow again with the previous image. I don't want to trigger anything until you've confirmed that from the workflow file itself, not from my memory of it. Please read `.github/workflows/` and tell me:

1. what inputs the promote workflow takes,
2. which image tag is running in production now,
3. which tag was running before it.

Don't trigger anything. Read-only for now.

## Assistant

I'll read the workflow files first, then check the run history for the tags.

Your understanding matches the files. What I found:

**Workflow.** `.github/workflows/promote.yml` is triggered by `workflow_dispatch` only. Its inputs are:
- `image_tag` (required): the tag to deploy
- `environment` (`staging` or `production`, default `staging`)

The job does not build anything. It checks that `image_tag` exists in the container registry, then updates the tag the Terraform config uses for the API service and applies it. So a rollback is just a promotion of an older tag.

**Related file.** `.github/workflows/deploy-staging.yml` runs on push to `main`. It builds the image, tags it `sha-<7 chars>` and deploys it to staging. That matches what I'd expect: merging to main deploys to staging, and production only changes through promote.

**Tags.** From the promote run history:
- Currently in production: `sha-8c41d7a`, promoted last night at 21:48 UTC.
- Before that: `sha-52be09f`, promoted six days ago, with no promote runs in between.

Both tags still exist in the registry, so the older one hasn't been cleaned up.

There is also a second route: revert the commit on `main` and let it flow through staging to production. It is slower and I wouldn't lead with it, but you should know it's there.

## User

No, a revert is the wrong tool here, and I'd like you to drop it from the options. It would need a pull request with two approvals, it would be squash-merged, it would go to staging first, and then someone would still have to run promote. That's three steps to take on an incident where the errors are live. It also leaves `main` in a state where the bad change has been "undone" before anyone has understood it, which makes the follow-up harder to reason about. The image swap is the fast path and leaves the code history alone.

Before I run it, one check. I want to be sure `sha-52be09f` is a clean target. Two things could make it unsafe:

- If last night's release included a database migration, the older image might not work against the new schema.
- If any infrastructure change went out alongside it, going back to the older image wouldn't undo that.

Look at what changed between `sha-52be09f` and `sha-8c41d7a`, both in application code and in the Terraform directory, and tell me whether either risk applies.

## Assistant

Fair point on the revert. I'll leave it out.

I compared the two commits behind those tags. Eleven commits landed between them, and the range touches:

- `src/routes/exports.ts` and `src/services/export-queue.ts`: a new bulk export endpoint and its worker
- `src/middleware/rate-limit.ts`: a small change to how the limit key is built
- two test files

**Migrations.** `db/migrations/` has no new files in that range, so the older image sees the same schema it ran against before. The first risk doesn't apply.

**Infrastructure.** Nothing under `terraform/` changed in the range. The only Terraform difference is the image tag variable that promote sets. The second risk doesn't apply either.

One thing is worth noting for the follow-up. The rate-limit change is small but sits on every request, whereas the export endpoint only affects its own route. If the 5xx errors are spread across all endpoints, the middleware is the likelier cause. If they are concentrated on `/exports`, it's the new route. I can't tell which from the repository, so I'd leave that to the logs once things are stable.

`sha-52be09f` looks like a clean target.

## User

Good. That answers both. I was half expecting a migration, and the evidence says there isn't one, so I'm dropping that worry.

I've triggered promote with `environment` set to `production` and `image_tag` set to `sha-52be09f`. It finished in about four minutes, all steps green. The error rate is already falling and is back near baseline on the dashboard. I'll keep watching it for a while longer before I call it resolved.

Now the paperwork. Draft two things for me:

1. The note for the deploys channel in Slack. Deploy notes go to #eng-deploys. It needs to say what happened, what was done, the tags involved, and the current state. Plain facts, no apology, no speculation about the cause.
2. A follow-up ticket for Linear in the ENG team. It should cover finding the cause in the range of commits we just compared and re-releasing the change safely.

Draft only. I'll post and file them myself.

## Assistant

Here are both drafts.

**Slack, #eng-deploys**

```
Production rollback, API

What happened: after last night's promote of sha-8c41d7a (21:48 UTC), the API's 5xx rate rose from about 0.2% to about 4%.

What we did: ran the promote workflow again for production with the previous image, sha-52be09f. The run completed in about four minutes with all steps green.

Current state: production is on sha-52be09f. The error rate has returned to baseline and is being watched.

Notes: no migrations or Terraform changes were in the rolled-back range, so nothing else needs undoing. sha-8c41d7a stays blocked from promotion until a ticket is resolved. Follow-up is in Linear.
```

**Linear, team ENG**

Title: Find cause of 5xx increase in sha-8c41d7a and re-release safely

```
Context
Promoting sha-8c41d7a to production raised the API 5xx rate from about 0.2% to about 4%. Rolled back to sha-52be09f; error rate recovered.

Scope
Eleven commits between sha-52be09f and sha-8c41d7a. Main suspects:
- bulk export endpoint and worker (src/routes/exports.ts, src/services/export-queue.ts)
- rate-limit key change (src/middleware/rate-limit.ts)

To do
- Break down the errors by endpoint for the window after the deploy
- Reproduce on staging, which can run sha-8c41d7a
- Fix, or split the range so the safe commits ship first
- Add a test that covers the failure

Done when
A fixed build has been promoted to production and the error rate has stayed at baseline.
```

I wrote "stays blocked from promotion" in the Slack note, but nothing in the repo enforces that. If you don't want to promise it, cut that sentence.

## User

Two corrections.

First, the sentence about `sha-8c41d7a` being blocked: yes, remove it. You said yourself nothing enforces it, and a deploy note shouldn't claim a control we don't have. Replace it with one plain fact: nothing else has been promoted since.

Second, in the ticket, "Reproduce on staging, which can run sha-8c41d7a" is wrong as written. Merging to main deploys to staging, so staging may already be on `sha-8c41d7a` or something newer, and that is exactly how it got there. Don't tell the reader what staging can do. Tell them to check which tag staging is on first.

Also add a Rollback line to the ticket. It should say how the rollback was done, so whoever picks this up knows the same route is open.

## Assistant

Both corrections are right. Here are the updated versions.

**Slack, #eng-deploys**

```
Production rollback, API

What happened: after last night's promote of sha-8c41d7a (21:48 UTC), the API's 5xx rate rose from about 0.2% to about 4%.

What we did: ran the promote workflow again for production with the previous image, sha-52be09f. The run completed in about four minutes with all steps green.

Current state: production is on sha-52be09f. The error rate has returned to baseline and is being watched. Nothing else has been promoted since.

Notes: no migrations or Terraform changes were in the rolled-back range, so nothing else needs undoing. Follow-up is in Linear.
```

**Linear, team ENG**, with the changed sections only:

```
To do
- Check which tag staging is currently on; it follows main, so it may be newer than sha-8c41d7a
- Break down the errors by endpoint for the window after the deploy
- Reproduce on staging with sha-8c41d7a or a build that includes the same commits
- Fix, or split the range so the safe commits ship first
- Add a test that covers the failure

Rollback
Done by running the promote workflow again for production with the previous image (sha-52be09f). The same route is open for any later release.
```

The context, scope and done-when sections are unchanged.

## User

That's what I wanted. I'll post the note and file the ticket now, then keep an eye on the dashboard until the afternoon.

One last thing before I close this out: write me a three-line summary of the incident that I can paste into my handover notes for the next person on call. Include the two tags, the time of the rollback, and where the follow-up lives. Keep it to facts you have actually seen in this session. If you don't have a fact, leave a gap marked `TODO` rather than guessing.

## Assistant

Here's the handover summary:

```
Production API 5xx rose from about 0.2% to about 4% after promoting sha-8c41d7a (21:48 UTC, 31 Aug); rolled back by running promote for production with the previous image, sha-52be09f.
Rollback finished at TODO (about four minutes after it was triggered); error rate back near baseline, still being watched.
Follow-up: Linear ticket in team ENG, number TODO; announcement in #eng-deploys.
```

I left two `TODO` gaps because I haven't seen those facts. I don't know the exact time the rollback run finished, only that it took about four minutes. You can read it from the promote run page. The Linear ticket number doesn't exist until you file it.
