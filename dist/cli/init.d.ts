export interface InitOptions {
    /** When true, copy canonical specialists to .specialists/default/ and migrate legacy layouts. */
    syncDefaults?: boolean;
    /** When true, overwrite canonical skills in .xtrm/skills/default/ and refresh active symlinks only. */
    syncSkills?: boolean;
    /** Skip xtrm prerequisites (.xtrm dir + xt CLI). Useful for CI/testing. */
    noXtrmCheck?: boolean;
}
export declare function run(opts?: InitOptions): Promise<void>;
//# sourceMappingURL=init.d.ts.map