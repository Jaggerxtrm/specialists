// src/cli/follow-up.ts
// DEPRECATED: Use `specialists resume` instead.
export async function run() {
    process.stderr.write('\x1b[33m⚠ DEPRECATED:\x1b[0m `specialists follow-up` is deprecated. Use `specialists resume` instead.\n\n');
    const { run: resumeRun } = await import('./resume.js');
    return resumeRun();
}
//# sourceMappingURL=follow-up.js.map