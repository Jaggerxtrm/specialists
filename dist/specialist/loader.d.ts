import { type ScriptEntry, type Specialist } from './schema.js';
export interface StallDetectionConfig {
    running_silence_warn_ms?: number;
    running_silence_error_ms?: number;
    waiting_stale_ms?: number;
    tool_duration_warn_ms?: number;
}
export interface SpecialistSummary {
    name: string;
    description: string;
    category: string;
    version: string;
    model: string;
    permission_required: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH';
    interactive: boolean;
    thinking_level?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    skills: string[];
    scripts: ScriptEntry[];
    scope: 'default' | 'user';
    filePath: string;
    updated?: string;
    filestoWatch?: string[];
    staleThresholdDays?: number;
    stallDetection?: StallDetectionConfig;
}
/** Returns STALE, AGED, or OK based on file mtimes vs metadata.updated */
export declare function checkStaleness(summary: SpecialistSummary): Promise<'OK' | 'STALE' | 'AGED'>;
interface LoaderOptions {
    projectDir?: string;
}
export declare class SpecialistLoader {
    private cache;
    private projectDir;
    constructor(options?: LoaderOptions);
    private getScanDirs;
    private toJson;
    private resolveSpecialistPath;
    list(category?: string): Promise<SpecialistSummary[]>;
    get(name: string): Promise<Specialist>;
    invalidateCache(name?: string): void;
}
export {};
//# sourceMappingURL=loader.d.ts.map