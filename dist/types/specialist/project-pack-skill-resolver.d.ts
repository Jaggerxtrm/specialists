/**
 * Immediate children of `<consumerRoot>/.xtrm/skills/` that are managed layout
 * roots, never project packs. Mirrors the canonical set in the service-knowledge
 * machinery (`RESERVED_PACK_NAMES`): {default, optional, user, active, local-legacy}.
 */
export declare const RESERVED_SKILL_ROOTS: readonly string[];
export interface SkillResolutionContext {
    /** Project dir the specialist runs for; owns `.xtrm/skills/` (bounded search root). */
    consumerRoot: string;
    /** Manifest file dir; only consumed for `./`-prefixed entries. */
    fileDir: string;
}
/** Thrown when a bare logical skill matches more than one consumer project pack. */
export declare class ProjectPackSkillAmbiguityError extends Error {
    readonly skillName: string;
    /** Raw caller-supplied consumer root — programmatic use only; never rendered into `.message`. */
    readonly consumerRoot: string;
    readonly matches: string[];
    constructor(skillName: string,
    /** Raw caller-supplied consumer root — programmatic use only; never rendered into `.message`. */
    consumerRoot: string, matches: string[], displayLines: string[]);
}
/** Fail-closed rejection of a symlinked/escaping/non-file candidate. Message contains no host paths. */
export declare class ProjectPackSkillSecurityError extends Error {
    readonly skillName: string;
    /** Repo-relative path under the consumer root (no host prefix). */
    readonly repoRelativePath: string;
    constructor(skillName: string,
    /** Repo-relative path under the consumer root (no host prefix). */
    repoRelativePath: string, detail: string);
}
/**
 * True when `declared` is a single path segment with no separators (`/` or
 * `\`): a bare logical skill name that routes through the consumer
 * project-pack tree. Windows-style backslashes are rejected so `foo\bar` can
 * never be misclassified as a logical name.
 */
export declare function isBareLogicalSkillName(declared: string): boolean;
/**
 * Resolve one declared skills.paths entry to an absolute path.
 *
 * - `~/...`  -> <home>/...
 * - `./...`  -> <fileDir>/...
 * - bare name -> project-pack tree, global-default fallback
 * - anything else (absolute, literal relative) -> unchanged
 */
export declare function resolveSkillPath(declared: string, ctx: SkillResolutionContext): string;
/**
 * Resolve a bare logical skill name inside the bounded consumer tree
 * `<consumerRoot>/.xtrm/skills/<pack>/<skill>/`. Returns the canonical skill
 * dir (containing a regular, non-symlinked `SKILL.md` file) for exactly one
 * project-pack match, the global-default candidate otherwise, and throws on
 * ambiguity or on any probe/symlink/escape failure.
 */
export declare function resolveBareLogicalSkill(skillName: string, consumerRoot: string): string;
//# sourceMappingURL=project-pack-skill-resolver.d.ts.map