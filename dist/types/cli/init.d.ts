export interface InitOptions {
    /** Deprecated alias: keep only for intentional pin/bootstrap compatibility. */
    syncDefaults?: boolean;
    /** When true, overwrite canonical skills in .xtrm/skills/default/ and refresh active symlinks only. */
    syncSkills?: boolean;
    /** Skip xtrm prerequisites (.xtrm dir + xt CLI). Useful for CI/testing. */
    noXtrmCheck?: boolean;
    /** When true, manage the global ~/.config/specialists/user.json override layer instead of bootstrapping a project. */
    global?: boolean;
}
/**
 * Generate / extend the global ~/.config/specialists/user.json override layer.
 * Idempotent: seeds every shipped specialist with null/[] defaults on first run;
 * on re-run extends with newly-shipped specialists and fills missing override
 * fields WITHOUT clobbering user-filled values. Removed specialists stay in the
 * file and are surfaced in stdout (no JSON comments — doctor flags them).
 */
export declare function runGlobal(): Promise<void>;
export declare function run(opts?: InitOptions): Promise<void>;
//# sourceMappingURL=init.d.ts.map