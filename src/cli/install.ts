// src/cli/install.ts
// DEPRECATED: Redirect to `specialists init`

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

export async function run(): Promise<void> {
  console.log('');
  console.log(yellow('⚠ DEPRECATED: `specialists install` is deprecated'));
  console.log('');
  console.log(`  Use ${bold('specialists init')} instead.`);
  console.log('');
  console.log('  The init command:');
  console.log('    • creates specialists/ and .specialists/ directories');
  console.log('    • registers the MCP server in .mcp.json');
  console.log('    • injects workflow context into AGENTS.md/CLAUDE.md');
  console.log('');
  console.log(`  ${dim('Run: specialists init --help for full details')}`);
  console.log('');
}