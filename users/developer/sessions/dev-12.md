---
id: dev-12
user: developer
at: 2026-06-30T15:00:00+01:00
surface: vscode
project: tidewell-infra
kind: build
---

## User

I'm in the Core API team's infrastructure repo, `tidewell-infra`, and I need to get a new service out the way everything at Tidewell goes out. It's called `notifications`. It's a small HTTP service that other services call when they want to send a user-facing message. The application code lives in its own repo, so this task is only the infrastructure side. The work is tracked under TW-1207, so the branch should be `TW-1207-notifications-service`.

Before you change anything, I'd like you to read the repo and tell me what you think the deploy setup is. I'll tell you where I think you've got it wrong, because some of this isn't obvious from the files. For context: everything we run is on AWS, on ECS with Fargate. The infrastructure is all Terraform, and each service is meant to be an instance of our service module, not hand-written resources. Merging to main deploys to staging automatically. Production is never automatic. It goes out through the promote workflow in GitHub Actions, and someone runs that by hand. Deploy notes go to #eng-deploys in Slack, and at the moment I think nothing posts there from the pipeline, which is part of what I want you to add.

So for this first step: read-only. Tell me what the layout is, how a service is defined, what the workflows do, and what you'd add for `notifications`. Don't edit anything yet.

## Assistant

I'll read the Terraform layout and the workflows first, without editing anything.

Here is what I found in `/Users/dev/work/tidewell-infra`.

**Layout**

- `terraform/modules/service/` is the service module. It has `main.tf`, `variables.tf` and `outputs.tf`. It creates an ECS task definition (Fargate launch type), an ECS service, a load balancer target group and listener rule, a log group, and a task execution role plus a task role per service.
- `terraform/services/` has one file per service: `accounts.tf`, `billing-events.tf`, `catalog.tf` and `gateway.tf`. Each is a single `module "<name>"` block that calls `../modules/service` with a handful of inputs.
- `terraform/environments/staging/` and `terraform/environments/production/` each have a `main.tf` and a `terraform.tfvars`. They pull in the files under `services/`, so a service defined once exists in both environments.
- `README.md` has a table of services and who owns them.

**Module inputs**

The required ones are `name`, `container_port`, `health_check_path`, `cpu`, `memory` and `desired_count`. `image_tag` is also required. There's no default for it, and the module builds the image reference from the registry prefix plus `name` plus `image_tag`. Optional inputs cover environment variables, extra task-role policy documents, and the listener rule's path pattern.

**Workflows (`.github/workflows/`)**

- `deploy-staging.yml` triggers on push to `main`. It builds the image, tags it with the short commit SHA, pushes it, then registers a new task definition revision and updates the ECS service in staging. It waits for the service to become stable.
- `promote.yml` triggers on `workflow_dispatch` only. Its inputs are `service` (a choice list) and `image_tag`. It updates the same service in production to the given tag, and it runs under a GitHub environment named `production`, which I assume has protection rules configured in GitHub. I can't see those from the repo.
- `terraform-plan.yml` runs `terraform plan` on pull requests for both environments.

Nothing in either deploy workflow posts to Slack. I searched for webhook references and found none.

**What I'd add for `notifications`**

1. `terraform/services/notifications.tf` with one `module "notifications"` block calling the service module. I'd mirror `accounts.tf`, since it's the closest in shape.
2. Add `notifications` to the `service` choice list in `promote.yml`, and to the build matrix in `deploy-staging.yml` if the matrix is explicit. I need to check that.
3. A step at the end of `promote.yml` that posts a deploy note to #eng-deploys.
4. A row in the README services table.

**Questions before I start**

- What are the container port, health check path, and cpu and memory sizes?
- What `desired_count` for each environment?
- For the Slack step, do you already have a webhook stored as a GitHub Actions secret, or should I assume a name for one?

## User

Good read, and you've got it right. `promote.yml` does run under the `production` environment, and the protection rules are set up in GitHub, as you guessed.

Values: container port 8080, health check path `/healthz`, cpu 256, memory 512. For `desired_count`, look at what `accounts.tf` does and follow that. It's the same pattern for everything, and I don't want `notifications` to be a special case. I haven't agreed any exceptions with anyone.

One thing before you write the block. You said the module builds the image reference from `name` plus `image_tag`, and I can guess where this is going: you're about to give `image_tag` a default of `latest` so the block is shorter. Don't. The whole point of the promote workflow is that production gets exactly the tag staging ran, which is the commit SHA. A `latest` default would let someone apply Terraform and silently move a service to whatever was pushed last. The block should require an explicit tag. For the first apply, use whatever tag the application repo's first build produced. I'll give you that in a moment, but make the variable required in the `notifications` block, with a clear placeholder in the tfvars comment until I fill it in.

The webhook is a GitHub Actions secret called `SLACK_DEPLOY_WEBHOOK`. It exists at the repository level, so both workflows can see it.

## Assistant

Understood on `image_tag`. I'm leaving the module's variable required, with no default, and not adding a `latest` fallback anywhere. Let me check `accounts.tf` and the matrix in the staging workflow.

`accounts.tf` sets `desired_count = var.default_desired_count`. It's defined in each environment's `terraform.tfvars` (2 in staging, 3 in production), so the service block itself carries no numbers. I'll follow that exactly.

What I changed:

- **`terraform/services/notifications.tf`** (new). A single `module "notifications"` block with `name = "notifications"`, `container_port = 8080`, `health_check_path = "/healthz"`, `cpu = 256`, `memory = 512`, and `desired_count = var.default_desired_count`. `image_tag` is passed through from a per-environment variable, `var.notifications_image_tag`.
- **`terraform/environments/staging/variables.tf`** and **`production/variables.tf`**. I declared `notifications_image_tag` as a required string with no default, plus a description saying it must be a commit SHA tag, not a moving tag.
- **Both `terraform.tfvars` files.** I added `notifications_image_tag = "REPLACE_WITH_FIRST_BUILD_SHA"` with a comment above it explaining that it needs the first build's tag before apply. I used an obviously invalid placeholder on purpose, so a plan against it fails at the image lookup and doesn't quietly produce something plausible.
- **`.github/workflows/deploy-staging.yml`.** The build matrix was a hard-coded list, so I added `notifications` to it.

`terraform validate` in `environments/staging` failed on the first run:

```
Error: Missing required argument
  on ../../services/notifications.tf line 1, in module "notifications":
  The argument "health_check_path" is required, but no definition was found.
```

I had written `healthcheck_path` in the block, so the key was misspelled. That's fixed, and `terraform validate` now passes in both environments. `terraform fmt -check` is clean.

I haven't touched `promote.yml` yet. Once I do, I'll add `notifications` to its `service` choice list.

## User

Next, the Slack step. Add it to `promote.yml`, after the production update has succeeded and the service is stable. Not before, because a note saying "deployed" when the rollout failed is worse than no note.

What I'd like in the message: the service name, the tag, who ran the workflow, and a list of the pull requests that went out since the last production release of that service. The reviewers like that list; it saves them reading the staging history.

Use the standard approach for the Slack post. Don't invent anything exotic.

## Assistant

I'll read `promote.yml` in full before I write the step.

Two findings affect the plan, one of which touches the list of pull requests.

**1. The workflow has no record of what production ran before.** The inputs are `service` and `image_tag`, and it calls the ECS update with the new tag. Nothing stores or reads the previously promoted tag, so "since the last production release" isn't derivable from the workflow as it stands. There are three ways to get it:

- Read the current production task definition before updating and extract the old tag from its image field. That works but adds an extra AWS call and some parsing to a workflow that's currently straightforward.
- Query the GitHub API for the last successful `promote.yml` run for the same service and read its inputs. That gets awkward when promotes for different services interleave.
- Skip the list and link to the compare view between two tags. That still needs the old tag, so it's the first option again.

**2. The Slack step.** For the post itself, the standard approach in Actions is a marketplace action that wraps the webhook. I could use one, pinned to a SHA. I'd also suggest putting the same step in `deploy-staging.yml`, so staging merges show up in the channel as well and the two environments read consistently.

I've drafted the step with `curl` and the secret, not an action, to keep the change small. The core is:

```
- name: Post deploy note
  if: success()
  env:
    SLACK_DEPLOY_WEBHOOK: ${{ secrets.SLACK_DEPLOY_WEBHOOK }}
  run: |
    curl -sS -X POST -H 'Content-Type: application/json' \
      --data "$(jq -n --arg t "$TEXT" '{text:$t}')" \
      "$SLACK_DEPLOY_WEBHOOK"
```

I haven't committed it yet. Do you want the pull-request list, given the extra moving part, and do you want the staging post?

## User

Two answers, and one of them is a change of mind.

The list: I assumed the workflow already knew the previous tag. It doesn't, so you'd be adding state or an AWS parse-and-diff step to a workflow that everyone on the team has to be able to read in thirty seconds. That's the evidence I needed. Drop the list. The note gets the service, the tag, who ran it, and a link to the workflow run. If a reviewer wants the history, the tag is a commit SHA and they can look it up.

The staging post: no. Staging deploys on every merge to main, and if each one posts to #eng-deploys, the production notes get buried in the noise. That channel is how people know something went out to production. Only the promote workflow posts.

You were right to use `curl` and not an action, and my reason is the same as the one you gave: the rest of our workflows depend on a very short list of actions, and I don't want another dependency for one POST. Keep the `jq -n` for the body too, since a bare string in the JSON breaks as soon as a value contains a quote.

## Assistant

Agreed on all three. The pull-request list is out, the staging post is out, and `curl` plus `jq -n` stays.

Here are the changes to **`.github/workflows/promote.yml`**:

- `notifications` is added to the `service` choice list.
- A new final step, `Post deploy note`, runs only on success. It comes after the step that waits for the ECS service to become stable. That ordering gives you what you asked for: nothing is posted unless the rollout finished.
- The step builds its message from `${{ inputs.service }}`, `${{ inputs.image_tag }}`, `${{ github.actor }}`, and the run URL assembled from `github.server_url`, `github.repository` and `github.run_id`. I pass them in through `env:` and not by inlining `${{ }}` into the shell script. That keeps the shell from interpreting a value as code, and it's tidier anyway.
- The message reads like this:

```
Production deploy: notifications @ 3f9c2ab by <actor>
https://github.com/<org>/tidewell-infra/actions/runs/<id>
```

- The webhook comes from `SLACK_DEPLOY_WEBHOOK`. I didn't hard-code a channel in the workflow. The webhook is tied to #eng-deploys on the Slack side, so the workflow doesn't need to name it. I left a comment above the step saying the secret posts to #eng-deploys, so the next reader doesn't have to go and look.

I made no changes to `deploy-staging.yml` other than the matrix entry from before. I confirmed with a search that it contains no reference to Slack or the webhook.

One thing I noticed and left alone: `promote.yml` doesn't pin `actions/checkout` to a SHA the way `deploy-staging.yml` does. That's outside this task. Say if you want it aligned.

## User

Leave the pinning alone, that's a separate ticket and someone else's. Good that you didn't touch it.

Now the housekeeping. This work needs to go in as a pull request, and we have rules about those. The branch is `TW-1207-notifications-service`, which is the ticket key plus a short slug. Create it and move the changes onto it. The title has to start with the Jira key: `TW-1207: Add notifications service and deploy note`. The description has four sections, in this order: Why, What changed, How I tested, Rollback. Our template lives in the team handbook in Notion, not in this repo, so you won't find it. I'm telling you the structure from memory, and it's stable.

Every pull request needs two approvals before it can merge. I'd personally set it lower for infrastructure changes this small, but that's the rule and I'm not going to argue it for this one. Don't mention it as if it were my preference in the description. It doesn't belong there anyway.

For "How I tested", I need real output: run `terraform plan` for staging and tell me what it says. If it can't run, tell me why and don't invent a result.

## Assistant

I'll create the branch and then try the plan.

The branch `TW-1207-notifications-service` now exists, and the changes from the earlier steps are on it. They're unstaged edits in the same working tree, so nothing was lost in moving them.

**Plan result.** I ran `terraform init` and `terraform plan` in `terraform/environments/staging`. The plan didn't complete, and that's expected given the state of things:

```
Error: reading image tag: no matching image found for "notifications:REPLACE_WITH_FIRST_BUILD_SHA"
```

That's the placeholder you wanted to fail loudly, so it's doing its job. It means I can't give you a real "N to add" count yet. What I can say truthfully is that `terraform validate` passes in both environments and `terraform fmt -check` is clean. The plan itself needs the real first-build tag in both `terraform.tfvars` files. Once you give me that SHA I'll put it in and rerun. I won't write a plan summary into the description until I have one.

Here is a draft of the description. "How I tested" says only what has been done:

**Title:** `TW-1207: Add notifications service and deploy note`

**Why**
The `notifications` service needs to run on the same ECS/Fargate setup as every other service. Production deploys also have no visible record in Slack, so people don't see when something has gone out.

**What changed**
- `terraform/services/notifications.tf`: new instance of the service module (port 8080, `/healthz`, cpu 256, memory 512, `desired_count` from the per-environment default).
- `notifications_image_tag` is a required variable in both environments, with no default, so the tag is always explicit.
- `notifications` added to the staging build matrix and to the `service` choices in `promote.yml`.
- `promote.yml` posts a deploy note to #eng-deploys after a successful, stable production rollout. Staging does not post.
- README services table updated.

**How I tested**
- `terraform validate` and `terraform fmt -check` pass in staging and production.
- `terraform plan` TO BE FILLED IN once the first build tag is set.

**Rollback**
Revert this pull request. Since the `notifications` service is new, there is nothing to roll back in the other services. For a bad production deploy of `notifications`, run the promote workflow again with the previous tag.

I haven't pushed the branch or opened the pull request. Tell me when.

## User

The description is close. Two corrections.

First, the Rollback section. "Revert this pull request" is incomplete for Terraform. Reverting the code doesn't remove a service that has already been created in AWS. Someone would have to run a destroy for that module, or the service stays running and orphaned. Say that plainly. The accurate rollback is: before the first production apply, reverting is enough; after it, the module has to be destroyed through Terraform, not by deleting the file alone. You're right that re-running the promote workflow with the previous tag is how you roll back a bad release, so keep that.

Second, I want to check something about the promote workflow that I should have asked earlier. A new service isn't in production yet. When someone runs the promote workflow for `notifications` the first time, does the "update service" call have anything to update? Look at the order of operations and tell me what you find. Don't fix it yet.

## Assistant

Rollback corrected. I'll put your wording in the description once we've settled the second question.

**What the promote workflow does for a service that doesn't exist yet.** I read `promote.yml` again, step by step:

1. It configures AWS credentials for the `production` environment.
2. It runs `aws ecs describe-services` for the service, looking it up by cluster and name.
3. It registers a new task definition revision from the current one, with the image tag swapped.
4. It runs `update-service` with the new revision, then waits for stability.

Step 2 is where a brand-new service would stop. If the ECS service doesn't exist, `describe-services` returns it in `failures` with reason `MISSING`, and the next step reads a field that isn't there. The step would error out. So promote can't create anything. It can only move an existing service to a different tag.

That means the sequence for a new service has to be:

1. The Terraform change is applied to production, which creates the task definition and the ECS service at the placeholder-replaced first tag.
2. After that, promote works as normal for every later release.

So the first production apply is Terraform's job, and promote isn't involved until the second release. That's consistent with how the other four services must have started, but I can't see from the repo how the production apply is run. There's a plan workflow, but nothing in `.github/workflows/` runs `terraform apply`. So I can't tell you who applies it or when, and I won't guess in the description.

Two options for the description: leave out the apply entirely, or add a line under "What changed" saying the first production tag in `terraform.tfvars` must be one that staging has already run. Which do you want?

## User

Add the line. Keep it factual: the production tfvars tag for `notifications` has to be a tag that already ran in staging. That matches what promote enforces everywhere else, and I'd rather the description say it than rely on someone knowing.

The apply is run by hand by whoever is on the infrastructure rotation, outside the repo. It's not in the workflows deliberately. Don't add it, and don't put the mechanics in the description. That's not what this pull request is about.

Now, the test I care most about is the Slack step, since a broken step in `promote.yml` only shows up when somebody is in the middle of a production deploy. I can't run the workflow for real. Can you run the message-building part locally, with made-up values, and show me exactly what body would be sent? Don't send anything to the real webhook. Print the JSON and stop.

## Assistant

Added to "What changed": "The production `notifications_image_tag` must be a tag that has already run in staging." The apply isn't mentioned.

I ran the message-building lines from the step in a shell with fake values. They are `SERVICE=notifications`, `TAG=3f9c2ab`, `ACTOR=asha-test`, and a made-up run URL. The `curl` line was replaced with `echo`, so nothing was sent. The first run found a real bug.

My original script built the text with `\n` inside a double-quoted string. In the shell that stays a literal backslash-n, and `jq --arg` then escaped the backslash, so the body came out as:

```
{"text":"Production deploy: notifications @ 3f9c2ab by asha-test\\nhttps://example.test/runs/1"}
```

Slack would have shown the two characters `\n` in the middle of the message, not a line break. I changed the step to build the text with `printf` and a real newline:

```
TEXT=$(printf 'Production deploy: %s @ %s by %s\n%s' \
  "$SERVICE" "$TAG" "$ACTOR" "$RUN_URL")
```

The rerun printed the correct body:

```
{"text":"Production deploy: notifications @ 3f9c2ab by asha-test\nhttps://example.test/runs/1"}
```

I then tried a value containing a double quote (`ACTOR='a"b'`). The output was `by a\"b`, so the quoting holds and the JSON remains valid, which is what `jq -n --arg` is for. I also passed the body through `jq .` to confirm it parses.

The edited `promote.yml` also passes `actionlint`-style checks if you have it installed. I don't, so I can only say the workflow file parses as valid workflow syntax by loading it. I haven't proven that GitHub will accept it.

The step only ever runs under `if: success()`. So a failure in the earlier steps never reaches it, and nothing is posted.

## User

Good catch on the newline. That's the kind of thing I was worried about.

Last two tasks. First, the README services table: add `notifications` with the Core API team as the owner, matching the other rows. Second, take a final pass over the whole diff and give me a plain summary: files touched, what each does, anything unfinished. I'll fill in the first-build tag myself and rerun the plan, then open the pull request. Don't push the branch.

## Assistant

I added the `notifications` row to the README services table with the Core API team as owner, in the same column format as the others, and I ran the diff review.

**Files touched on `TW-1207-notifications-service`**

- `terraform/services/notifications.tf` (new): one `module "notifications"` call. It uses port 8080, health check `/healthz`, cpu 256, memory 512, `desired_count = var.default_desired_count`, and `image_tag` from `var.notifications_image_tag`.
- `terraform/environments/staging/variables.tf` and `production/variables.tf`: declare `notifications_image_tag` as a required string with no default.
- `terraform/environments/staging/terraform.tfvars` and `production/terraform.tfvars`: `notifications_image_tag = "REPLACE_WITH_FIRST_BUILD_SHA"`, with a comment above it. This is the one unfinished item.
- `.github/workflows/deploy-staging.yml`: `notifications` added to the build matrix. Nothing else changed, and it doesn't post to Slack.
- `.github/workflows/promote.yml`: `notifications` added to the `service` choices. A final `Post deploy note` step, on success only, after the stability wait. It posts the service, tag, actor and run link to #eng-deploys through `SLACK_DEPLOY_WEBHOOK`, built with `printf` and `jq -n`.
- `README.md`: new services table row.

**Unfinished or worth checking**

1. Both tfvars files still hold the placeholder. Until you replace it with the real first-build SHA, `terraform plan` fails at the image lookup. That is deliberate, but it means the "How I tested" plan line is still marked TO BE FILLED IN. The line needs the real result once you've rerun it.
2. Use the same SHA in the production tfvars only if staging has already run it, as the description now says.
3. The description's Rollback section now says that reverting is enough only before the first production apply. After that, the `notifications` module has to be destroyed through Terraform, and a bad release is rolled back by running the promote workflow with the previous tag.
4. I couldn't run the workflow itself. The Slack step is verified only by running its message-building lines with fake values, not against GitHub or the real webhook.
5. The `actions/checkout` pinning difference in `promote.yml` is untouched, as you asked.

Reminder for the pull request: the title is `TW-1207: Add notifications service and deploy note`, the description has Why, What changed, How I tested and Rollback in that order, and it needs two approvals before it can merge. The branch isn't pushed.
