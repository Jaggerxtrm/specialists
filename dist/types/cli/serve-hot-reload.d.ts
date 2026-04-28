import type { SpecialistLoader } from '../specialist/loader.js';
export interface HotReloadOptions {
    loader: SpecialistLoader;
    userDir: string;
    debounceMs?: number;
    pollMs?: number;
    onReload?: (changedNames: string[]) => void;
}
export interface HotReloadHandle {
    stop(): void;
}
export declare function createUserDirWatcher(opts: HotReloadOptions): HotReloadHandle;
//# sourceMappingURL=serve-hot-reload.d.ts.map