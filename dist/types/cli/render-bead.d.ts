import { type Specialist } from '../specialist/schema.js';
/**
 * The minimal specialist a roleless render stands in for: the bead context and
 * its boundary rules, and nothing else. `$prompt` is the resolved bead body that
 * `renderTaskPrompt` builds, so the rendered task is bead content verbatim plus
 * the MANDATORY_RULES block every surface gets.
 *
 * Parsed through SpecialistSchema so schema defaults (bare: false, no skills, no
 * mandatory_rules overrides) apply exactly as they would for a real config.
 */
export declare function rolelessSpecialist(): Specialist['specialist'];
export declare function run(): void;
//# sourceMappingURL=render-bead.d.ts.map