import { type MandatoryRulesInjection } from './mandatory-rules.js';
/**
 * Bare specialists skip ordinary/default/specialist rule stacks, but they do
 * not leave the XTRM work system. Resolve the canonical index with globals and
 * specialist-local rules disabled, then retain only required MUST_KEEP sets.
 */
export declare function buildRequiredPlatformRulesInjection(cwd: string, budgetLimit?: number): MandatoryRulesInjection;
export declare function buildRequiredPlatformRulesBlock(cwd: string, budgetLimit?: number): string;
//# sourceMappingURL=required-platform-rules.d.ts.map