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
export interface MandatoryRulesSection {
    setId: string;
    block: string;
    priority: 'must_keep' | 'important' | 'optional';
    ruleCount: number;
}
export interface MandatoryRulesInjection {
    block: string;
    sections: MandatoryRulesSection[];
    setsLoaded: string[];
    ruleCount: number;
    inlineRulesCount: number;
    globalsDisabled: boolean;
    budgetLimit: number;
    candidateTokens: number;
    injectedTokens: number;
    injectedSectionIds: string[];
    evictedSectionIds: string[];
    payloadDigest: string;
    outcome: 'full' | 'degraded';
}
export type MandatoryRulesBudgetResult = Pick<MandatoryRulesInjection, 'block' | 'sections' | 'budgetLimit' | 'candidateTokens' | 'injectedTokens' | 'injectedSectionIds' | 'evictedSectionIds' | 'payloadDigest' | 'outcome'>;
export declare class MandatoryRulesBudgetError extends Error {
    readonly budgetLimit: number;
    readonly candidateTokens: number;
    readonly mustKeepTokens: number;
    readonly injectedSectionIds: string[];
    readonly evictedSectionIds: string[];
    readonly outcome: "impossible";
    constructor(budgetLimit: number, candidateTokens: number, mustKeepTokens: number, injectedSectionIds: string[], evictedSectionIds: string[]);
    readonly injectedTokens = 0;
}
export declare function compileMandatoryRulesBudget(candidateSections: MandatoryRulesSection[], budgetLimit: number): MandatoryRulesBudgetResult;
export declare function loadMandatoryRulesIndex(cwd: string): MandatoryRulesIndex | null;
export declare function buildMandatoryRulesInjection(specialistConfig: {
    cwd?: string;
    specialist?: {
        mandatory_rules?: SpecialistMandatoryRulesConfig;
    };
}, budgetLimit?: number): MandatoryRulesInjection;
export declare function buildMandatoryRulesBlock(specialistConfig: {
    cwd?: string;
    specialist?: {
        mandatory_rules?: SpecialistMandatoryRulesConfig;
    };
}): string;
export {};
//# sourceMappingURL=mandatory-rules.d.ts.map