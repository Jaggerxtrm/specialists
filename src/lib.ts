// src/lib.ts — Library entry point for Node consumers.
// Importable via: import { runScript, ... } from '@jaggerxtrm/specialists/lib'
//
// Stable surface for embedding script-class specialist invocations into
// other Node services without spawning the CLI or running sp serve.

export {
  runScriptSpecialist as runScript,
} from './specialist/script-runner.js';

export type {
  ScriptGenerateRequest,
  ScriptGenerateResult,
  ScriptGenerateSuccess,
  ScriptGenerateFailure,
  ScriptSpecialistErrorType,
  ScriptRunnerOptions,
} from './specialist/script-runner.js';

export { SpecialistLoader } from './specialist/loader.js';
export type { Specialist } from './specialist/schema.js';

// K4 (unitAI-e67up.4): Core K2 launcher-outcome consumer contract surface.
export {
  LAUNCH_OUTCOME_SCHEMA_VERSION,
  LaunchOutcomeError,
  parseLaunchOutcome,
  validateLaunchOutcome,
  projectLaunchOutcome,
} from './specialist/launch-outcome.js';

export {
  readVerifiedCitationWindow,
  verifyExactLineCitation,
} from './specialist/citation-evidence.js';
export type {
  CitationLine,
  VerifiedCitationWindow,
  VerifiedCitationWindowOptions,
  RawPiReadEvidence,
  ExactLineClaim,
  ExactLineCitationResult,
} from './specialist/citation-evidence.js';
export type {
  LaunchOutcome,
  LaunchOutcomeProjection,
  LaunchOutcomeErrorCode,
  LaunchOutcomeAction,
  LaunchOutcomeIdentity,
  LaunchOutcomeReadiness,
  LaunchOutcomeWorktree,
  LaunchOutcomeRuntime,
  LaunchOutcomeSafetyProfile,
  LaunchOutcomeSideEffect,
  LaunchOutcomeMutationRecord,
} from './specialist/launch-outcome.js';
