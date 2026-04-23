import { run as runEdit } from './edit.js';
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
function usage() {
    return [
        'Usage:',
        '  specialists config get <key> [--all] [--name <specialist>]',
        '  specialists config set <key> <value> [--all] [--name <specialist>]',
        '',
        'Deprecated alias of specialists edit:',
        '  specialists edit --all --get <key>',
        '  specialists edit --all --set <key> <value>',
        '  specialists edit <name> --get <key>',
        '  specialists edit <name> --set <key> <value>',
    ].join('\n');
}
function fail(message) {
    console.error(message);
    process.exit(1);
}
function buildEditArgv(argv) {
    const command = argv[0];
    if (command !== 'get' && command !== 'set') {
        fail(usage());
    }
    const key = argv[1];
    if (!key || key.startsWith('--')) {
        fail(`Missing key\n\n${usage()}`);
    }
    const translated = [];
    let index = 2;
    if (command === 'set') {
        const value = argv[2];
        if (value === undefined || value.startsWith('--')) {
            fail(`Missing value for set\n\n${usage()}`);
        }
        translated.push('--set', key, value);
        index = 3;
    }
    else {
        translated.push('--get', key);
    }
    let hasName = false;
    let hasAll = false;
    for (let i = index; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--all') {
            translated.push('--all');
            hasAll = true;
            continue;
        }
        if (token === '--name') {
            const name = argv[++i];
            if (!name || name.startsWith('--')) {
                fail('--name requires a specialist name');
            }
            translated.unshift(name);
            hasName = true;
            continue;
        }
        fail(`Unknown option: ${token}\n\n${usage()}`);
    }
    if (!hasName && !hasAll) {
        translated.unshift('--all');
    }
    return translated;
}
export async function run() {
    const originalArgs = process.argv.slice(3);
    const editArgs = buildEditArgv(originalArgs);
    console.error(`${yellow('⚠ DEPRECATED')} specialists config is deprecated. Use ${yellow('specialists edit')} instead.`);
    process.argv = [process.argv[0] ?? 'node', process.argv[1] ?? 'specialists', 'edit', ...editArgs];
    await runEdit();
}
//# sourceMappingURL=config.js.map