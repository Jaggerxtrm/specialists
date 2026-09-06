import {
  buildMandatoryRulesInjection,
  compileMandatoryRulesBudget,
  type MandatoryRulesInjection,
} from './mandatory-rules.js';

/**
 * Bare specialists skip ordinary/default/specialist rule stacks, but they do
 * not leave the XTRM work system. Resolve the canonical index with globals and
 * specialist-local rules disabled, then retain only required MUST_KEEP sets.
 */
export function buildRequiredPlatformRulesInjection(
  cwd: string,
  budgetLimit = Number.POSITIVE_INFINITY,
): MandatoryRulesInjection {
  const resolved = buildMandatoryRulesInjection({
    cwd,
    specialist: {
      mandatory_rules: {
        disable_default_globals: true,
        template_sets: [],
        inline_rules: [],
      },
    },
  });

  const requiredCandidates = resolved.sections.filter((section) => section.priority === 'must_keep');
  const compiled = compileMandatoryRulesBudget(requiredCandidates, budgetLimit);
  const injectedIds = new Set(compiled.injectedSectionIds);
  const retainedRequired = requiredCandidates.filter((section) => injectedIds.has(section.setId));

  return {
    ...resolved,
    ...compiled,
    setsLoaded: retainedRequired.map((section) => section.setId),
    ruleCount: retainedRequired.reduce((count, section) => count + section.ruleCount, 0),
    inlineRulesCount: 0,
    globalsDisabled: true,
  };
}

export function buildRequiredPlatformRulesBlock(
  cwd: string,
  budgetLimit = Number.POSITIVE_INFINITY,
): string {
  return buildRequiredPlatformRulesInjection(cwd, budgetLimit).block;
}
