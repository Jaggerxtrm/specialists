# Running bug-hunt Specialist in Background for unitAI-xyz

You already have a beads issue `unitAI-xyz` assigned to you. Because this is a deep bug investigation (long-running, benefits from a dedicated expert), you should use the bead-first workflow with `--background`.

## Exact Commands to Run

### Step 1 — Verify the specialist exists

```bash
specialists list
```

Look for `bug-hunt` in the output. If it does not appear, only project-scoped specialists are searched (`./specialists/*.specialist.yaml`). Confirm the file exists in your project.

### Step 2 — Start the specialist in the background, linked to your bead

```bash
specialists run bug-hunt --bead unitAI-xyz --background
```

This returns immediately with a job ID, for example:

```
Job started: job_a1b2c3d4
```

The specialist's system prompt will automatically have the context from bead `unitAI-xyz` injected (at the default depth of 1). If the auth module issue has related parent/child beads you want included, add `--context-depth 2` (or higher):

```bash
specialists run bug-hunt --bead unitAI-xyz --background --context-depth 2
```

### Step 3 — Monitor progress (live feed)

```bash
specialists feed job_a1b2c3d4 --follow
```

Or follow all active jobs at once:

```bash
specialists feed -f
```

Event types you will see:
- `text` — streamed output tokens
- `thinking` — model reasoning
- `tool` — specialist calling a tool
- `run_complete` — job finished

### Step 4 — Read the final result once complete

```bash
specialists result job_a1b2c3d4
```

Capture to a file if you want to preserve it:

```bash
specialists result job_a1b2c3d4 > auth-bug-investigation.md
```

You will also see a completion banner injected into your next prompt:

```
[Specialist 'bug-hunt' completed (job job_a1b2c3d4, 42s). Run: specialists result job_a1b2c3d4]
```

### Step 5 — Close the bead when the investigation is done

```bash
bd close unitAI-xyz --reason "Bug investigation complete — findings in auth-bug-investigation.md"
```

### If you need to cancel

```bash
specialists stop job_a1b2c3d4
```

---

## Summary of the Full Command Sequence

```bash
specialists list                                               # confirm bug-hunt exists
specialists run bug-hunt --bead unitAI-xyz --background       # start async job
# → Job started: job_a1b2c3d4

specialists feed job_a1b2c3d4 --follow                        # monitor live
specialists result job_a1b2c3d4                               # read output when done
bd close unitAI-xyz --reason "Investigation complete"         # close the bead
```
