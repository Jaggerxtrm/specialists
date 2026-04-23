export class JobRegistry {
    jobs = new Map();
    register(id, meta) {
        this.jobs.set(id, {
            id,
            status: 'running',
            outputBuffer: '',
            currentEvent: 'starting',
            backend: meta.backend,
            model: meta.model,
            specialistVersion: meta.specialistVersion ?? '?',
            startedAtMs: Date.now(),
        });
    }
    appendOutput(id, text) {
        const job = this.jobs.get(id);
        if (job && job.status === 'running')
            job.outputBuffer += text;
    }
    setCurrentEvent(id, eventType) {
        const job = this.jobs.get(id);
        if (job && job.status === 'running')
            job.currentEvent = eventType;
    }
    /** Update backend/model from the first assistant message_start event. */
    setMeta(id, meta) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        if (meta.backend)
            job.backend = meta.backend;
        if (meta.model)
            job.model = meta.model;
    }
    /** Store the beads issue ID for this job. */
    setBeadId(id, beadId) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        job.beadId = beadId;
    }
    /** Register the kill function for this job. If job was already cancelled, invokes immediately. */
    setKillFn(id, killFn) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        if (job.status === 'cancelled') {
            killFn(); // race: cancel was called before session was ready
            return;
        }
        job.killFn = killFn;
    }
    /** Register the steer function for this job. */
    setSteerFn(id, steerFn) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        job.steerFn = steerFn;
    }
    /** Register resume/close functions for a keep-alive job. Sets status to 'waiting'. */
    setResumeFn(id, resumeFn, closeFn) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        job.resumeFn = resumeFn;
        job.closeFn = closeFn;
        job.status = 'waiting';
        job.currentEvent = 'waiting';
    }
    /** Send a follow-up prompt to a waiting keep-alive job. */
    async followUp(id, message) {
        const job = this.jobs.get(id);
        if (!job)
            return { ok: false, error: `Job not found: ${id}` };
        if (job.status !== 'waiting')
            return { ok: false, error: `Job is not waiting (status: ${job.status})` };
        if (!job.resumeFn)
            return { ok: false, error: 'Job has no resume function' };
        job.status = 'running';
        job.currentEvent = 'starting';
        try {
            const output = await job.resumeFn(message);
            job.outputBuffer = output;
            job.status = 'waiting';
            job.currentEvent = 'waiting';
            return { ok: true, output };
        }
        catch (err) {
            job.status = 'error';
            job.error = err?.message ?? String(err);
            return { ok: false, error: job.error };
        }
    }
    /** Close a keep-alive session and mark the job done. */
    async closeSession(id) {
        const job = this.jobs.get(id);
        if (!job)
            return { ok: false, error: `Job not found: ${id}` };
        if (job.status !== 'waiting')
            return { ok: false, error: `Job is not in waiting state` };
        try {
            await job.closeFn?.();
            job.status = 'done';
            job.currentEvent = 'done';
            job.endedAtMs = Date.now();
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err?.message ?? String(err) };
        }
    }
    /** Send a mid-run steering message to the Pi agent for this job. */
    async steer(id, message) {
        const job = this.jobs.get(id);
        if (!job)
            return { ok: false, error: `Job not found: ${id}` };
        if (job.status !== 'running')
            return { ok: false, error: `Job is not running (status: ${job.status})` };
        if (!job.steerFn)
            return { ok: false, error: 'Job session not ready for steering yet' };
        try {
            await job.steerFn(message);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err?.message ?? String(err) };
        }
    }
    complete(id, result) {
        const job = this.jobs.get(id);
        if (!job || job.status !== 'running')
            return; // no-op if cancelled
        job.status = 'done';
        job.outputBuffer = result.output;
        job.currentEvent = 'done';
        job.backend = result.backend;
        job.model = result.model;
        job.specialistVersion = result.specialistVersion;
        job.endedAtMs = Date.now();
        if (result.beadId)
            job.beadId = result.beadId;
    }
    fail(id, err) {
        const job = this.jobs.get(id);
        if (!job || job.status !== 'running')
            return; // no-op if cancelled
        job.status = 'error';
        job.error = err.message;
        job.currentEvent = 'error';
        job.endedAtMs = Date.now();
    }
    /** Kill the pi process and mark the job as cancelled. */
    cancel(id) {
        const job = this.jobs.get(id);
        if (!job)
            return undefined;
        job.killFn?.();
        job.status = 'cancelled';
        job.currentEvent = 'cancelled';
        job.endedAtMs = Date.now();
        return { status: 'cancelled', duration_ms: job.endedAtMs - job.startedAtMs };
    }
    snapshot(id, cursor = 0) {
        const job = this.jobs.get(id);
        if (!job)
            return undefined;
        const isDone = job.status === 'done';
        return {
            job_id: job.id,
            status: job.status,
            output: isDone ? job.outputBuffer : '',
            delta: job.outputBuffer.slice(cursor),
            next_cursor: job.outputBuffer.length,
            current_event: job.currentEvent,
            backend: job.backend,
            model: job.model,
            specialist_version: job.specialistVersion,
            duration_ms: (job.endedAtMs ?? Date.now()) - job.startedAtMs,
            error: job.error,
            beadId: job.beadId,
        };
    }
    delete(id) {
        this.jobs.delete(id);
    }
}
//# sourceMappingURL=jobRegistry.js.map