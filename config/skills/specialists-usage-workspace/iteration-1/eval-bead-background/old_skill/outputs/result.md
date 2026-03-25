# Background Bug Hunt: Step-by-Step Commands

## Scenario
You have a beads issue `unitAI-xyz` assigned for deep bug investigation in the auth module.
You want to run the `bug-hunt` specialist in the background.

---

## Step 1: Verify the specialist exists

```bash
specialists list
```

Or filter if there are many:

```bash
specialists list --category analysis
```

Confirm `bug-hunt` appears in the output. If it does not, it is not installed in the project scope (`./specialists/*.specialist.yaml`).

---

## Step 2: Start the specialist in the background

```bash
specialists run bug-hunt --bead unitAI-xyz --background
```

This returns immediately with a job ID, for example:

```
Job started: job_a1b2c3d4
```

The specialist will read the bead context from `unitAI-xyz` (title, description, linked files) and use it as its prompt. No `--prompt` flag is needed — `--bead` is the canonical input for tracked work.

---

## Step 3: Monitor progress

Follow all active jobs live (recommended):

```bash
specialists feed -f
```

Or follow only this job:

```bash
specialists feed job_a1b2c3d4 --follow
```

You will see event types as they arrive:
- `text` — streamed output tokens
- `thinking` — model reasoning
- `tool` — specialist invoking a tool
- `run_complete` — job finished

---

## Step 4: Read the result when done

```bash
specialists result job_a1b2c3d4
```

Capture to a file if desired:

```bash
specialists result job_a1b2c3d4 > auth-bug-hunt.md
```

---

## Step 5: Close the bead

Once you have reviewed the findings:

```bash
bd close unitAI-xyz --reason "Bug investigation complete, findings documented"
```

---

## Summary of all commands

```bash
specialists list
specialists run bug-hunt --bead unitAI-xyz --background
# → Job started: job_a1b2c3d4
specialists feed -f
specialists result job_a1b2c3d4
bd close unitAI-xyz --reason "Bug investigation complete, findings documented"
```

---

## Notes

- Do not use `--prompt` when passing `--bead` — the bead supplies the context.
- Use `--context-depth 2` if the bead has upstream dependencies worth injecting (e.g., a parent issue describing broader scope).
- If the job hangs, run `specialists stop job_a1b2c3d4` then check `specialists feed job_a1b2c3d4` for the last event.
- If `bug-hunt` is not found, run `specialists doctor` to check for YAML errors or missing specialist files.
