// src/specialist/project-pack-skill-resolver.ts
// Shared resolution of a single declared skills.paths entry (unitAI-jndsb.11).
//
// Repo skills layout v2: a bare logical skill name (`service-knowledge`) is a
// reference into the bounded consumer project-pack tree
// <consumerRoot>/.xtrm/skills/<pack>/<skill>/SKILL.md. The loader resolves every
// declared path before pre-run validation, Pi `--skill` argv construction, and
// the direct/script surface, so both spawn paths receive the same absolute path.
//
// Precedence for a bare logical name:
//   1. exactly one project-pack match  -> that skill dir (project wins)
//   2. more than one project-pack match -> hard ambiguity failure (no fallback,
//      never first filesystem order; unitAI-jndsb.11)
//   3. zero project-pack matches -> global-default candidate
//      ~/.xtrm/skills/default/<name> (existence is enforced by the existing
//      pre-run validator, preserving the deterministic "skill not found" failure)
//
// Security posture (unitAI-jndsb.11 security review):
//   - The consumer root and skills root are canonicalized (realpath); a
//     `.xtrm/skills` symlink that resolves outside the canonical consumer root
//     fails closed.
//   - Candidate probing uses lstat: a symlinked `<pack>/<skill>` directory or a
//     symlinked SKILL.md is rejected; SKILL.md must be a regular file AND
//     readable (access R_OK), so chmod-000 skill files fail closed. Only an
//     actually ABSENT candidate directory (ENOENT) means no match — a
//     discovered directory missing SKILL.md, ENOTDIR, EACCES/EPERM, and I/O
//     errors all fail closed so a partial/broken project install can never
//     silently select a same-named global skill.
//   - A non-reserved symbolic link directly under `.xtrm/skills/` (which could
//     masquerade as a pack) is rejected; ordinary files such as state.json or
//     INVARIANTS.md are ignored as non-packs, matching canonical service-
//     knowledge discovery.
//   - The canonical candidate directory (and its SKILL.md) is asserted to stay
//     inside the canonical skills root before it is returned.
//   - Externally propagated error messages carry only the logical skill name and
//     repo-relative paths — never absolute host paths. (Immutable-snapshot/TOCTOU
//     hardening and direct/script lexical allow-root hardening are tracked in
//     unitAI-jndsb.14.)
//
// Non-bare forms are preserved exactly: `~/` expands to the user home, `./`
// resolves against the manifest file dir, absolute and literal-relative paths
// pass through untouched.
import { accessSync, constants, readdirSync, lstatSync, realpathSync, type Dirent, type Stats } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

/**
 * Immediate children of `<consumerRoot>/.xtrm/skills/` that are managed layout
 * roots, never project packs. Mirrors the canonical set in the service-knowledge
 * machinery (`RESERVED_PACK_NAMES`): {default, optional, user, active, local-legacy}.
 */
export const RESERVED_SKILL_ROOTS: readonly string[] = [
  'default',
  'optional',
  'user',
  'active',
  'local-legacy',
];

export interface SkillResolutionContext {
  /** Project dir the specialist runs for; owns `.xtrm/skills/` (bounded search root). */
  consumerRoot: string;
  /** Manifest file dir; only consumed for `./`-prefixed entries. */
  fileDir: string;
}

/** Thrown when a bare logical skill matches more than one consumer project pack. */
export class ProjectPackSkillAmbiguityError extends Error {
  constructor(
    public readonly skillName: string,
    /** Raw caller-supplied consumer root — programmatic use only; never rendered into `.message`. */
    public readonly consumerRoot: string,
    public readonly matches: string[],
    displayLines: string[],
  ) {
    super(
      `skills.paths: logical skill '${escapeDiagnostic(skillName)}' is ambiguous — matches more than one project pack:\n` +
        `${displayLines.map((line) => `    ${escapeDiagnostic(line)}`).join('\n')}\n` +
        `Disambiguate with an explicit path: .xtrm/skills/<pack>/<skill> (consumer-relative), an absolute path, or a ~/ path.`,
    );
    this.name = 'ProjectPackSkillAmbiguityError';
  }
}

/** Fail-closed rejection of a symlinked/escaping/non-file candidate. Message contains no host paths. */
export class ProjectPackSkillSecurityError extends Error {
  constructor(
    public readonly skillName: string,
    /** Repo-relative path under the consumer root (no host prefix). */
    public readonly repoRelativePath: string,
    detail: string,
  ) {
    super(
      `skills.paths: logical skill '${escapeDiagnostic(skillName)}' — '${escapeDiagnostic(repoRelativePath)}' ${detail}`,
    );
    this.name = 'ProjectPackSkillSecurityError';
  }
}

/**
 * Escape C0/C1 control characters and DEL (including ANSI ESC 0x1B) into a
 * deterministic visible `\uXXXX` form so interpolated diagnostics can never
 * carry terminal/HTTP-injection bytes. The raw values stay available on the
 * error's programmatic properties; only rendered `.message` text is escaped.
 */
function escapeDiagnostic(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) => {
    const codeHex = (char.codePointAt(0) ?? 0).toString(16).padStart(4, '0');
    return `\\u${codeHex}`;
  });
}

/**
 * Wrap a resolver-owned filesystem failure into a bounded SecurityError.
 * Raw syscall messages carry absolute host paths; the public `.message` must
 * expose only the logical skill, the repo-relative location, and a stable
 * error code. The original error is preserved programmatically on `cause`.
 */
function wrapFsError(
  skillName: string,
  repoRelativePath: string,
  operation: string,
  error: unknown,
): ProjectPackSkillSecurityError {
  const code = escapeDiagnostic((error as { code?: string } | null)?.code ?? 'UNKNOWN');
  const wrapped = new ProjectPackSkillSecurityError(
    skillName,
    repoRelativePath,
    `is not usable (${code}) while ${operation}; rejected`,
  );
  Object.assign(wrapped, { cause: error });
  return wrapped;
}

/**
 * True when `declared` is a single path segment with no separators (`/` or
 * `\`): a bare logical skill name that routes through the consumer
 * project-pack tree. Windows-style backslashes are rejected so `foo\bar` can
 * never be misclassified as a logical name.
 */
export function isBareLogicalSkillName(declared: string): boolean {
  if (declared.length === 0) return false;
  if (declared === '.' || declared === '..') return false;
  if (declared.startsWith('~')) return false;
  return !declared.includes('/') && !declared.includes('\\');
}

/**
 * Resolve one declared skills.paths entry to an absolute path.
 *
 * - `~/...`  -> <home>/...
 * - `./...`  -> <fileDir>/...
 * - bare name -> project-pack tree, global-default fallback
 * - anything else (absolute, literal relative) -> unchanged
 */
export function resolveSkillPath(declared: string, ctx: SkillResolutionContext): string {
  if (declared.startsWith('~/')) return join(process.env.HOME || '', declared.slice(2));
  if (declared.startsWith('./')) return join(ctx.fileDir, declared.slice(2));
  if (isBareLogicalSkillName(declared)) return resolveBareLogicalSkill(declared, ctx.consumerRoot);
  return declared;
}

function isPathInside(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel));
}

function globalDefaultCandidate(skillName: string): string {
  return join(homedir(), '.xtrm', 'skills', 'default', skillName);
}

/**
 * Fail-closed probe of one project-pack candidate `<pack>/<skill>` under the
 * canonical skills root. Returns the canonical in-tree candidate directory, or
 * null only when the candidate directory is actually absent. Everything else
 * throws: symlinked skill dirs, symlinked SKILL.md, non-directory skills, a
 * discovered directory missing SKILL.md, non-file SKILL.md, unreadable skill
 * files, and canonical targets that escape the canonical skills root.
 */
function probeCandidate(
  skillName: string,
  canonicalConsumer: string,
  canonicalSkillsRoot: string,
  candidate: string,
): string | null {
  const candidateRel = relative(canonicalConsumer, candidate);

  // Skill dir: must exist, must be a real directory (not a symlink).
  let dirStat: Stats;
  try {
    dirStat = lstatSync(candidate);
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === 'ENOENT') return null; // absent candidate -> no match
    throw wrapFsError(skillName, candidateRel, 'probing the skill directory', error);
  }
  if (dirStat.isSymbolicLink()) {
    throw new ProjectPackSkillSecurityError(skillName, candidateRel, 'is a symlink; symlinked skill directories are rejected');
  }
  if (!dirStat.isDirectory()) {
    // e.g. a discovered `<pack>/<skill>` is a file -> deterministic ENOTDIR.
    throw new ProjectPackSkillSecurityError(
      skillName,
      candidateRel,
      'is not a directory (ENOTDIR); expected a skill directory',
    );
  }

  // SKILL.md: must exist, must be a regular file, must not be a symlink.
  const skillFile = join(candidate, 'SKILL.md');
  const skillFileRel = relative(canonicalConsumer, skillFile);
  let mdStat: Stats;
  try {
    mdStat = lstatSync(skillFile);
  } catch (error: unknown) {
    // A discovered skill directory must contain SKILL.md. A missing file here
    // could silently select a same-named global after a partial/broken project
    // install — fail closed. Only an absent candidate DIRECTORY means no match.
    if ((error as { code?: string } | null)?.code === 'ENOENT') {
      throw new ProjectPackSkillSecurityError(
        skillName,
        skillFileRel,
        'is missing SKILL.md (ENOENT); a discovered skill directory must contain a regular SKILL.md file',
      );
    }
    throw wrapFsError(skillName, skillFileRel, 'probing the skill file', error);
  }
  if (mdStat.isSymbolicLink()) {
    throw new ProjectPackSkillSecurityError(skillName, skillFileRel, 'is a symlink; symlinked SKILL.md files are rejected');
  }
  if (!mdStat.isFile()) {
    throw new ProjectPackSkillSecurityError(
      skillName,
      skillFileRel,
      'exists but is not a regular file; expected SKILL.md as a file',
    );
  }

  // A regular file can still be unreadable (chmod 000): stat() alone accepts
  // it, and the runner later only checks directory existence. Fail closed on
  // EACCES/EPERM before the skill can be forwarded to Pi.
  try {
    accessSync(skillFile, constants.R_OK);
  } catch (error: unknown) {
    throw wrapFsError(skillName, skillFileRel, 'checking skill file readability', error);
  }

  // Canonicalize and assert containment before returning (defense in depth:
  // intermediate segments were already verified real, but the returned path
  // must provably live inside the canonical skills root).
  let canonicalCandidate: string;
  let canonicalSkillFile: string;
  try {
    canonicalCandidate = realpathSync(candidate);
    canonicalSkillFile = realpathSync(skillFile);
  } catch (error: unknown) {
    throw wrapFsError(skillName, candidateRel, 'canonicalizing the skill path', error);
  }
  if (!isPathInside(canonicalCandidate, canonicalSkillsRoot) || !isPathInside(canonicalSkillFile, canonicalSkillsRoot)) {
    throw new ProjectPackSkillSecurityError(
      skillName,
      candidateRel,
      'resolves outside the consumer skills root; rejected',
    );
  }
  return canonicalCandidate;
}

/**
 * Resolve a bare logical skill name inside the bounded consumer tree
 * `<consumerRoot>/.xtrm/skills/<pack>/<skill>/`. Returns the canonical skill
 * dir (containing a regular, non-symlinked `SKILL.md` file) for exactly one
 * project-pack match, the global-default candidate otherwise, and throws on
 * ambiguity or on any probe/symlink/escape failure.
 */
export function resolveBareLogicalSkill(skillName: string, consumerRoot: string): string {
  let canonicalConsumer: string;
  try {
    canonicalConsumer = realpathSync(consumerRoot);
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === 'ENOENT') return globalDefaultCandidate(skillName); // absent consumer root -> zero project packs
    throw wrapFsError(skillName, '.', 'resolving the consumer root', error);
  }

  const skillsRoot = join(canonicalConsumer, '.xtrm', 'skills');
  let canonicalSkillsRoot: string;
  try {
    canonicalSkillsRoot = realpathSync(skillsRoot);
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === 'ENOENT') return globalDefaultCandidate(skillName); // no .xtrm/skills tree
    throw wrapFsError(skillName, '.xtrm/skills', 'resolving the skills root', error);
  }
  if (!isPathInside(canonicalSkillsRoot, canonicalConsumer)) {
    throw new ProjectPackSkillSecurityError(
      skillName,
      '.xtrm/skills',
      'resolves outside the consumer root; rejected',
    );
  }

  let packs: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(canonicalSkillsRoot, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as { code?: string } | null)?.code === 'ENOENT') return globalDefaultCandidate(skillName);
    throw wrapFsError(skillName, '.xtrm/skills', 'listing the skills root', error);
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      // A symlink directly under the skills root could masquerade as a pack
      // and point the probe outside the consumer tree — reject it. Reserved
      // managed layout roots may legitimately be links; they are not packs.
      if (!(RESERVED_SKILL_ROOTS as readonly string[]).includes(entry.name)) {
        throw new ProjectPackSkillSecurityError(
          skillName,
          join('.xtrm', 'skills', entry.name),
          'is a symlink; symlinked pack directories are rejected',
        );
      }
      continue;
    }
    if (!entry.isDirectory()) continue; // state.json, INVARIANTS.md, ... are not packs
    if ((RESERVED_SKILL_ROOTS as readonly string[]).includes(entry.name)) continue; // managed layout roots are not packs
    packs.push(entry.name);
  }
  packs.sort(); // deterministic pack order: never first filesystem order

  const matches: string[] = [];
  for (const pack of packs) {
    const candidate = join(canonicalSkillsRoot, pack, skillName);
    const resolved = probeCandidate(skillName, canonicalConsumer, canonicalSkillsRoot, candidate);
    if (resolved) matches.push(resolved);
  }
  matches.sort(); // keep the ambiguity report stable regardless of collection order

  if (matches.length > 1) {
    throw new ProjectPackSkillAmbiguityError(
      skillName,
      consumerRoot,
      matches,
      matches.map((m) => relative(canonicalConsumer, m)),
    );
  }
  if (matches.length === 1) return matches[0];
  return globalDefaultCandidate(skillName);
}
