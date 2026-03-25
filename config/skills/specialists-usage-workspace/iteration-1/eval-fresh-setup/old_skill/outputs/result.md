# Fresh Setup: Specialists Walkthrough

## Step 1 — Initialize Specialists in Your Project

Run this once from your project root:

```bash
specialists init
```

This creates the `specialists/` and `.specialists/` directories and injects the workflow into `AGENTS.md`. Verify it worked:

```bash
specialists list
```

You should see the available specialists, including `code-review`.

---

## Step 2 — Delegate the Code Review as a Background Job

Since you want to keep working while the review runs, use `--background` mode.

### Option A: Ad-hoc (no tracking bead)

```bash
specialists run code-review --prompt "Review src/api.ts for correctness, security, and style issues" --background
```

This returns immediately with a job ID, for example:

```
Job started: job_a1b2c3d4
```

### Option B: Tracked with a bead (recommended for real work)

```bash
# Create a bead to track the review
bd create --title "Code review: src/api.ts" --type task --priority 2
# → unitAI-abc

# Run the specialist, linking it to the bead
specialists run code-review --bead unitAI-abc --background
# → Job started: job_a1b2c3d4
```

---

## Step 3 — Keep Working

The specialist is now running asynchronously. You can continue with whatever else you need to do. The job runs in the background and does not block your session.

---

## Step 4 — Monitor Progress (Optional)

To tail live output from all active jobs:

```bash
specialists feed -f
```

To follow just this job:

```bash
specialists feed job_a1b2c3d4 --follow
```

---

## Step 5 — Read the Result When Done

When the job completes, you will see a completion banner on your next prompt:

```
[Specialist 'code-review' completed (job job_a1b2c3d4, 42s). Run: specialists result job_a1b2c3d4]
```

Retrieve the full output:

```bash
specialists result job_a1b2c3d4
```

Capture it to a file:

```bash
specialists result job_a1b2c3d4 > review-api.md
```

---

## Step 6 — Close the Bead (If You Used One)

```bash
bd close unitAI-abc --reason "Review complete, addressed findings"
```

---

## Summary

| Step | Command |
|------|---------|
| Initialize project | `specialists init` |
| Verify specialists | `specialists list` |
| Start background review | `specialists run code-review --prompt "..." --background` |
| Monitor (optional) | `specialists feed -f` |
| Read result | `specialists result <job-id>` |

The key principle: use `--background` any time you want to keep working while a specialist runs. Use `--bead` to attach the run to a tracking issue for anything worth logging.
