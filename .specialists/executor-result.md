Implemented ✅ `start_specialist` is now Supervisor-backed.

### What I changed

- **Migrated MCP start path to Supervisor jobs**
  - `src/tools/specialist/start_specialist.tool.ts`
    - Removed `JobRegistry` dependency.
    - Now creates a `Supervisor` with `jobsDir = .specialists/jobs`.
    - Returns `job_id` from `onJobStarted` (immediate async behavior preserved).
    - Runs job in background via Supervisor lifecycle (writes `status.json`, `events.jsonl`, `result.txt`).

- **Migrated MCP stop path to Supervisor job state**
  - `src/tools/specialist/stop_specialist.tool.ts`
    - Removed `JobRegistry` cancel path.
    - Reads job via Supervisor `status.json`.
    - Sends `SIGTERM` to recorded PID (same model as CLI stop behavior).
    - Works for MCP-started + CLI-started jobs.

- **Wired server to new tool signatures**
  - `src/server.ts`
    - `createStartSpecialistTool(runner)`
    - `createStopSpecialistTool()`

- **Marked JobRegistry as legacy**
  - `src/specialist/jobRegistry.ts` header updated to explicitly mark as legacy compatibility layer.
  - `src/specialist/runner.ts` `startAsync` marked `@deprecated` (legacy in-memory async path).

- **Documented migration/deprecation**
  - `CHANGELOG.md` (`[Unreleased]` section) with:
    - MCP start → Supervisor-backed jobs
    - MCP stop → Supervisor/PID lifecycle
    - JobRegistry now legacy

### Tests added/updated

- Updated:
  - `tests/unit/tools/specialist/start_specialist.tool.test.ts`
    - Validates Supervisor-backed `job_id` + artifacts persisted under `.specialists/jobs/<id>/`.
    - Validates run option forwarding (`name/prompt/variables/backend_override/bead_id`).
- Added:
  - `tests/unit/tools/specialist/stop_specialist.tool.test.ts`
    - Missing job error case.
    - PID kill path success case.

### Validation run

- `npm run lint` ✅
- `npm test -- tests/unit/tools/specialist/start_specialist.tool.test.ts tests/unit/tools/specialist/stop_specialist.tool.test.ts` ✅

### Acceptance criteria mapping

- [x] `start_specialist` creates Supervisor-backed jobs visible to feed/status  
- [x] MCP observation tools work with MCP-started jobs (`feed_specialist` + `specialist_status` already file-based; `stop_specialist` now file/PID-based)  
- [x] JobRegistry deprecation documented  

---
Context: 41% used (est.)