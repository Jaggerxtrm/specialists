import { z } from 'zod';
import { type GlobalConfigSource } from '../../specialist/global-config.js';
import type { SpecialistLoader } from '../../specialist/loader.js';
export type ConfigFieldHint = string;
export interface ConfigField {
    path: string;
    value: unknown;
    defaultValue?: unknown;
    allowedHint: ConfigFieldHint;
    isEnum: boolean;
    enumValues?: string[];
    isOverride: boolean;
    isBlocked: boolean;
}
export interface ConfigSpecialistRow {
    name: string;
    hasOverride: boolean;
    fields: ConfigField[];
    blockedWarnings: string[];
}
export interface ConfigSnapshot {
    path: string;
    displayPath: string;
    source: GlobalConfigSource;
    exists: boolean;
    parseError?: string;
    validationErrors: Array<{
        path: string;
        message: string;
    }>;
    specialists: ConfigSpecialistRow[];
}
export declare function readGlobalConfigSnapshot(loader?: SpecialistLoader): ConfigSnapshot;
export declare function describeLeaf(path: string): {
    hint: string;
    isEnum: boolean;
    enumValues?: string[];
};
export declare function formatConfigValue(value: unknown): string;
export interface CoerceResult {
    ok: boolean;
    value?: unknown;
    error?: string;
}
export declare function getLeafSchema(path: string): z.ZodTypeAny | undefined;
export declare function coerceFieldValue(path: string, rawInput: string): CoerceResult;
export declare function applyFieldEdit(raw: Record<string, unknown>, specialist: string, path: string, value: unknown): Record<string, unknown>;
export interface WriteOutcome {
    ok: boolean;
    errors?: Array<{
        path: string;
        message: string;
    }>;
    errorClass?: string;
}
export declare function writeGlobalConfigSafe(rawObj: Record<string, unknown>, expectedMtimeMs?: number): WriteOutcome;
export declare function statConfigFileMtimeMs(): number | undefined;
//# sourceMappingURL=config-source.d.ts.map