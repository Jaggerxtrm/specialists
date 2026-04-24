import { readFile } from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { SpecialistLoader } from '../specialist/loader.js';
const ANSI_RESET = '\x1b[0m';
const bold = (value) => `\x1b[1m${value}${ANSI_RESET}`;
const dim = (value) => `\x1b[2m${value}${ANSI_RESET}`;
const cyan = (value) => `\x1b[36m${value}${ANSI_RESET}`;
const green = (value) => `\x1b[32m${value}${ANSI_RESET}`;
const yellow = (value) => `\x1b[33m${value}${ANSI_RESET}`;
const blue = (value) => `\x1b[34m${value}${ANSI_RESET}`;
const magenta = (value) => `\x1b[35m${value}${ANSI_RESET}`;
const SECTION_ALIASES = {
    metadata: 'metadata',
    execution: 'execution',
    prompt: 'prompt',
    skills: 'skills',
    capabilities: 'capabilities',
    communication: 'communication',
    validation: 'validation',
    stall: 'stall_detection',
    'stall-detection': 'stall_detection',
    stall_detection: 'stall_detection',
    beads: 'beads',
};
class ArgParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ArgParseError';
    }
}
function permissionBadge(permission) {
    if (permission === 'READ_ONLY')
        return green('[READ_ONLY]');
    if (permission === 'LOW')
        return cyan('[LOW]');
    if (permission === 'MEDIUM')
        return yellow('[MEDIUM]');
    return magenta('[HIGH]');
}
function parseArgs(argv) {
    const parsed = { raw: false, all: false };
    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];
        if (token === '--raw') {
            parsed.raw = true;
            continue;
        }
        if (token === '--all') {
            parsed.all = true;
            continue;
        }
        if (token === '--section') {
            const value = argv[index + 1];
            if (!value) {
                throw new ArgParseError('--section requires a value');
            }
            const normalized = SECTION_ALIASES[value.toLowerCase()];
            if (!normalized) {
                throw new ArgParseError(`Unsupported section \"${value}\"`);
            }
            parsed.section = normalized;
            index += 1;
            continue;
        }
        if (token.startsWith('--')) {
            throw new ArgParseError(`Unknown flag: ${token}`);
        }
        if (!parsed.name) {
            parsed.name = token;
            continue;
        }
        throw new ArgParseError(`Unexpected argument: ${token}`);
    }
    if (parsed.all && parsed.name) {
        throw new ArgParseError('--all cannot be combined with a specialist name');
    }
    return parsed;
}
function formatPromptValue(value) {
    if (!value || value.trim().length === 0) {
        return dim('(empty)');
    }
    return value;
}
function formatValue(value) {
    if (value === undefined)
        return dim('(unset)');
    if (value === null)
        return dim('null');
    if (typeof value === 'string')
        return value;
    return JSON.stringify(value, null, 2);
}
function printSectionHeader(title, color) {
    console.log();
    console.log(color(bold(title)));
    console.log(color('─'.repeat(title.length)));
}
function printPromptSection(prompt) {
    printSectionHeader('prompt', magenta);
    console.log(`${bold('system')}:`);
    console.log(formatPromptValue(prompt.system));
    console.log();
    console.log(`${bold('task_template')}:`);
    console.log(formatPromptValue(prompt.task_template));
    if (prompt.normalize_template !== undefined) {
        console.log();
        console.log(`${bold('normalize_template')}:`);
        console.log(formatValue(prompt.normalize_template));
    }
    if (prompt.skill_inherit !== undefined) {
        console.log();
        console.log(`${bold('skill_inherit')}: ${formatValue(prompt.skill_inherit)}`);
    }
    if (prompt.examples !== undefined) {
        console.log();
        console.log(`${bold('examples')}:`);
        console.log(formatValue(prompt.examples));
    }
    if (prompt.output_schema !== undefined) {
        console.log();
        console.log(`${bold('output_schema')}:`);
        console.log(formatValue(prompt.output_schema));
    }
}
function printGenericSection(title, color, value) {
    printSectionHeader(title, color);
    console.log(formatValue(value));
}
function printHeader(summary) {
    const scope = summary.scope === 'default' ? green('[default]') : summary.scope === 'package' ? blue('[package]') : yellow('[user]');
    const source = dim(summary.source);
    console.log();
    console.log(`${bold(cyan(summary.name))} ${scope} ${permissionBadge(summary.permission_required)} ${source}`);
    console.log(dim(summary.description));
    console.log(`${dim('model:')} ${summary.model}`);
    console.log(`${dim('version:')} ${summary.version}`);
    console.log(`${dim('source:')} ${summary.filePath}`);
}
function printCatalog(summaries) {
    if (summaries.length === 0) {
        console.log('No specialists found.');
        return;
    }
    const rows = [...summaries].sort((left, right) => left.name.localeCompare(right.name));
    console.log();
    console.log(bold(`Specialists catalog (${rows.length})`));
    console.log();
    for (const summary of rows) {
        const scope = summary.scope === 'default' ? green('[default]') : summary.scope === 'package' ? blue('[package]') : yellow('[user]');
        const keepAlive = summary.interactive ? yellow('[keep-alive]') : dim('[single-turn]');
        console.log(`${cyan(summary.name)} ${scope} ${permissionBadge(summary.permission_required)} ${keepAlive} ${dim(summary.source)}`);
        console.log(`${dim('  model:')} ${summary.model}`);
        console.log(`${dim('  category:')} ${summary.category}  ${dim('version:')} ${summary.version}`);
        console.log(`${dim('  desc:')} ${summary.description}`);
        console.log();
    }
}
function findSummary(summaries, name) {
    return summaries.find(summary => summary.name === name);
}
async function selectSpecialistFromCatalog(summaries) {
    if (!input.isTTY || !output.isTTY) {
        return null;
    }
    console.log(dim('Enter specialist name to view details (blank to cancel):'));
    const rl = readline.createInterface({ input, output });
    try {
        const selectedName = (await rl.question('> ')).trim();
        if (!selectedName)
            return null;
        return findSummary(summaries, selectedName) ?? null;
    }
    finally {
        rl.close();
    }
}
function printBySection(spec, section) {
    if (section === 'beads') {
        printGenericSection('beads', yellow, {
            beads_integration: spec.specialist.beads_integration,
            beads_write_notes: spec.specialist.beads_write_notes,
        });
        return;
    }
    if (section === 'prompt') {
        printPromptSection(spec.specialist.prompt);
        return;
    }
    const value = spec.specialist[section];
    printGenericSection(section, section === 'metadata' ? cyan : green, value);
}
function printFullSpecialist(spec) {
    printBySection(spec, 'metadata');
    printBySection(spec, 'execution');
    printBySection(spec, 'prompt');
    printBySection(spec, 'skills');
    printBySection(spec, 'capabilities');
    printBySection(spec, 'communication');
    printBySection(spec, 'validation');
    printBySection(spec, 'stall_detection');
    printBySection(spec, 'beads');
}
async function printRaw(summary) {
    const content = await readFile(summary.filePath, 'utf-8');
    console.log(content);
}
export async function run() {
    let args;
    try {
        args = parseArgs(process.argv.slice(3));
    }
    catch (error) {
        if (error instanceof ArgParseError) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
        throw error;
    }
    const loader = new SpecialistLoader();
    const summaries = await loader.list();
    if (args.all) {
        printCatalog(summaries);
        return;
    }
    let selectedSummary;
    if (args.name) {
        selectedSummary = findSummary(summaries, args.name);
        if (!selectedSummary) {
            console.error(`Specialist not found: ${args.name}`);
            process.exit(1);
        }
    }
    else {
        printCatalog(summaries);
        const chosen = await selectSpecialistFromCatalog(summaries);
        if (!chosen) {
            if (!input.isTTY || !output.isTTY) {
                console.log(dim('Pass a specialist name to render details (e.g. specialists view <name>).'));
            }
            return;
        }
        selectedSummary = chosen;
    }
    if (args.raw) {
        await printRaw(selectedSummary);
        return;
    }
    const specialist = await loader.get(selectedSummary.name);
    printHeader(selectedSummary);
    if (args.section) {
        printBySection(specialist, args.section);
        return;
    }
    printFullSpecialist(specialist);
}
//# sourceMappingURL=view.js.map