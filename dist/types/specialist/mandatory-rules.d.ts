export interface MandatoryRule {
    id: string;
    level: string;
    text: string;
    when?: string;
}
export interface MandatoryRuleSet {
    id: string;
    rules: MandatoryRule[];
}
export interface SpecialistMandatoryRulesConfig {
    template_sets?: string[];
    disable_default_globals?: boolean;
    inline_rules?: MandatoryRule[];
}
interface MandatoryRulesIndex {
    required_template_sets?: string[];
    default_template_sets?: string[];
}
export interface MandatoryRulesInjection {
    block: string;
    setsLoaded: string[];
    ruleCount: number;
    inlineRulesCount: number;
    globalsDisabled: boolean;
}
export declare function loadMandatoryRulesIndex(cwd: string): MandatoryRulesIndex | null;
export declare function buildMandatoryRulesInjection(specialistConfig: {
    cwd?: string;
    specialist?: {
        mandatory_rules?: SpecialistMandatoryRulesConfig;
    };
}): MandatoryRulesInjection;
export declare function buildMandatoryRulesBlock(specialistConfig: {
    cwd?: string;
    specialist?: {
        mandatory_rules?: SpecialistMandatoryRulesConfig;
    };
}): string;
export {};
//# sourceMappingURL=mandatory-rules.d.ts.map