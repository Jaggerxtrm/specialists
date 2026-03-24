# Fresh Setup + Background Code Review Walkthrough

## Step 1: Initialize specialists for your project

Run this once in your project root:

```bash
specialists init
```

This creates the `specialists/` and `.specialists/` directories, wires up hooks, and injects the AGENTS.md workflow context. After it completes, verify discovery works:

```bash
specialists list
```

You should see the available specialists. For code review work, this project has `parallel-review` (covers architecture, security, performance, quality).

> Note: There is no `code-review` specialist in this project. The closest equivalent is `parallel-review`, which runs concurrent analysis across multiple backends and synthesizes findings into a prioritized report.

---

## Step 2: Create a tracking bead

The canonical pattern for any real work is bead-first. Create a bead to track the review:

```bash
bd create --title "Code review: src/api.ts" --type task --priority 2
# Returns something like: unitAI-abc
```

---

## Step 3: Start the review in the background

Because code review takes more than 30 seconds and you want to keep working, use `--background`:

```bash
specialists run parallel-review --bead unitAI-abc --background
# → Job started: job_a1b2c3d4
```

Or, if you want to scope the prompt explicitly:

```bash
echo "Review src/api.ts for architecture, security, performance, and quality issues." | specialists run parallel-review --bead unitAI-abc --background
# → Job started: job_a1b2c3d4
```

The command returns immediately with a job ID. The specialist runs async while you continue your other work.

---

## Step 4: Keep working

Go work on whatever you were doing. The specialist runs independently in the background.

---

## Step 5: Monitor progress (optional)

If you want to check in:

```bash
specialists feed -f                        # follow all active jobs live
specialists feed job_a1b2c3d4 --follow     # follow just this job
```

When the job completes, the next prompt you send will show a completion banner:

```
[Specialist 'parallel-review' completed (job job_a1b2c3d4, 42s). Run: specialists result job_a1b2c3d4]
```

---

## Step 6: Read the result

```bash
specialists result job_a1b2c3d4
# or capture to file:
specialists result job_a1b2c3d4 > review-api.md
```

---

## Step 7: Close the bead

```bash
bd close unitAI-abc --reason "Review complete, issues triaged"
```

---

## Summary of all commands

```bash
# One-time setup
specialists init
specialists list

# Create tracking issue
bd create --title "Code review: src/api.ts" --type task --priority 2
# → unitAI-abc

# Delegate to specialist, return immediately
specialists run parallel-review --bead unitAI-abc --background
# → Job started: job_a1b2c3d4

# ... keep working ...

# Check status
specialists feed job_a1b2c3d4 --follow

# Read result
specialists result job_a1b2c3d4

# Close the bead
bd close unitAI-abc --reason "Review complete"
```

---

## Key points from the skill

- `specialists init` is the one-time project setup command. `specialists install` and `specialists setup` are deprecated aliases that redirect to it.
- Always use `--bead` for tracked work. `--prompt` is for quick, untracked, exploratory runs only.
- Use `--background` whenever the task takes >30 seconds or you want to keep working in parallel.
- `specialists doctor` runs detailed health checks (hooks, MCP wiring, zombie jobs) if anything seems wrong.
- `specialists list` only searches project scope (`./specialists/*.specialist.yaml`). User-scope (`~/.specialists/`) is deprecated.
- This project has `parallel-review` (not `code-review`) as the code review specialist — it covers all four focus areas: architecture, security, performance, and quality.
