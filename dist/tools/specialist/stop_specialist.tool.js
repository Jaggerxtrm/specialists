// src/tools/specialist/stop_specialist.tool.ts
import * as z from 'zod';
import { join } from 'node:path';
import { Supervisor } from '../../specialist/supervisor.js';
export const stopSpecialistSchema = z.object({
    job_id: z.string().describe('Job ID printed by specialists run'),
});
export function createStopSpecialistTool() {
    return {
        name: 'stop_specialist',
        description: 'Cancel a running specialist job by sending SIGTERM to its recorded process.',
        inputSchema: stopSpecialistSchema,
        async execute(input) {
            const jobsDir = join(process.cwd(), '.specialists', 'jobs');
            const supervisor = new Supervisor({ runner: null, runOptions: null, jobsDir });
            try {
                const status = supervisor.readStatus(input.job_id);
                if (!status) {
                    return { status: 'error', error: `Job not found: ${input.job_id}`, job_id: input.job_id };
                }
                if (status.status === 'done' || status.status === 'error') {
                    return {
                        status: 'error',
                        error: `Job is already ${status.status}`,
                        job_id: input.job_id,
                    };
                }
                if (!status.pid) {
                    return { status: 'error', error: `No PID recorded for job ${input.job_id}`, job_id: input.job_id };
                }
                try {
                    process.kill(status.pid, 'SIGTERM');
                    return { status: 'cancelled', job_id: input.job_id, pid: status.pid };
                }
                catch (err) {
                    if (err?.code === 'ESRCH') {
                        return { status: 'error', error: `Process ${status.pid} not found`, job_id: input.job_id };
                    }
                    return { status: 'error', error: err?.message ?? String(err), job_id: input.job_id };
                }
            }
            finally {
                await supervisor.dispose();
            }
        },
    };
}
//# sourceMappingURL=stop_specialist.tool.js.map