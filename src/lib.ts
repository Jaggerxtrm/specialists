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
