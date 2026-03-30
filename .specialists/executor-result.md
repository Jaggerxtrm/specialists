Updated **`docs/ARCHITECTURE.md`** with a source-driven architecture guide covering exactly what you requested:

- **Event pipeline** from `src/specialist/timeline-events.ts`
- **RPC adapter role** of `src/pi/session.ts` (ID-mapped request dispatch + ack checks)
- **Supervisor as sole durable lifecycle source** from `src/specialist/supervisor.ts`
- **Timeline completion model** (`run_complete` as canonical terminal event)
- **Stuck detection** (session liveness timeout + supervisor stale thresholds/events)
- **Bead ownership semantics** (input bead vs owned bead lifecycle)
- **`pi/rpc/` as canonical protocol reference** (`rpc-types.ts`, `rpc-mode.ts`, `rpc-client.ts`, `jsonl.ts`)

Also claimed and closed bead task **`unitAI-icb9.2`**.

---
Context: 19% used (estimate)