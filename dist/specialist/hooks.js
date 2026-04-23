// src/specialist/hooks.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
export class HookEmitter {
    tracePath;
    customHandlers = new Map();
    ready;
    constructor(options) {
        this.tracePath = options.tracePath;
        this.ready = mkdir(dirname(options.tracePath), { recursive: true }).then(() => { });
    }
    async emit(hook, invocationId, specialistName, specialistVersion, payload) {
        await this.ready;
        const event = {
            invocation_id: invocationId,
            hook,
            timestamp: new Date().toISOString(),
            specialist_name: specialistName,
            specialist_version: specialistVersion,
            ...payload,
        };
        await appendFile(this.tracePath, JSON.stringify(event) + '\n', 'utf-8');
        for (const handler of this.customHandlers.get(hook) ?? []) {
            Promise.resolve().then(() => handler(event)).catch(() => { });
        }
    }
    onHook(hook, handler) {
        if (!this.customHandlers.has(hook))
            this.customHandlers.set(hook, []);
        this.customHandlers.get(hook).push(handler);
    }
}
//# sourceMappingURL=hooks.js.map