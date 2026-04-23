import { invalidateAndRefreshMemoriesCache, syncMemoriesCacheFromBd } from '../specialist/memory-retrieval.js';
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
function printUsage() {
    console.log([
        '',
        'Usage: specialists memory <sync|refresh> [--force] [--json]',
        '',
        'Commands:',
        '  sync     Sync bd memories into local FTS cache',
        '  refresh  Invalidate cache and rebuild from bd memories',
        '',
    ].join('\n'));
}
export async function run(args = []) {
    const command = args[0] ?? 'sync';
    const force = args.includes('--force');
    const asJson = args.includes('--json');
    const cwd = process.cwd();
    if (command !== 'sync' && command !== 'refresh') {
        printUsage();
        process.exitCode = 1;
        return;
    }
    const result = command === 'refresh'
        ? invalidateAndRefreshMemoriesCache(cwd)
        : syncMemoriesCacheFromBd(cwd, Date.now(), force);
    if (asJson) {
        process.stdout.write(`${JSON.stringify({ command, ...result })}\n`);
        return;
    }
    console.log(`\n${bold('specialists memory')}`);
    console.log(`  command: ${command}`);
    console.log(`  synced: ${result.synced ? 'yes' : 'no'}`);
    console.log(`  memory_count: ${result.memoryCount}`);
}
//# sourceMappingURL=memory.js.map