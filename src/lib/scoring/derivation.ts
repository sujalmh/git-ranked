import type { DerivationWeights, Derived, Facts, OutcomeFacts } from './types';

export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export function norm(value: number): number {
  return clamp(0, 1, (value - 1) / 4);
}

export function derive(
  facts: Facts,
  weights: DerivationWeights,
  outcome?: OutcomeFacts | null
): Derived {
  const diffCfg = weights.difficulty;
  let diffScore = diffCfg.scopeBase[facts.scope] ?? 1;
  if (facts.cross_cutting) diffScore += diffCfg.crossCuttingBonus;
  if (facts.new_algorithm_or_subsystem) diffScore += diffCfg.newSubsystemBonus;
  if (facts.boilerplate) diffScore += diffCfg.boilerplatePenalty;
  const difficulty = clamp(1, 5, diffScore);

  const impCfg = weights.impact;
  let impScore = impCfg.scopeBase[facts.scope] ?? 1;
  const isUserVisible = facts.user_visible || (impCfg.documentationAsUserVisible && facts.documentation_updated);
  if (isUserVisible) impScore += impCfg.userVisibleBonus;
  if (facts.breaking_change) impScore += impCfg.breakingChangeBonus;

  if (outcome) {
    let outcomeBonus = 0;
    if (outcome.issue_closed_referencing_pr) outcomeBonus += impCfg.outcome.issueClosedBonus;
    if (outcome.released) outcomeBonus += impCfg.outcome.releasedBonus;
    if (outcome.unblocked_downstream) outcomeBonus += impCfg.outcome.unblockedBonus;
    impScore += Math.min(impCfg.outcome.outcomeCap, outcomeBonus);
  }
  const impact_base = clamp(1, 5, impScore);

  const execCfg = weights.execution;
  let execScore = execCfg.base;
  if (facts.testing_added) execScore += execCfg.testingAddedBonus;
  if (facts.documentation_updated) execScore += execCfg.documentationBonus;
  const execution_quality = clamp(1, 5, execScore);

  const novCfg = weights.novelty;
  let novScore = novCfg.base;
  if (facts.new_algorithm_or_subsystem) novScore += novCfg.newSubsystemBonus;
  if (facts.touches_architecture) novScore += novCfg.touchesArchitectureBonus;
  if (facts.boilerplate) novScore += novCfg.boilerplatePenalty;
  const novelty = clamp(1, 5, novScore);

  const rskCfg = weights.risk;
  let rskScore = rskCfg.base;
  if (facts.touches_auth) rskScore += rskCfg.authBonus;
  if (facts.touches_data_migration) rskScore += rskCfg.migrationBonus;
  if (facts.touches_distributed_state) rskScore += rskCfg.distributedStateBonus;
  if (facts.breaking_change) rskScore += rskCfg.breakingChangeBonus;
  const risk = clamp(1, 5, rskScore);

  const vw = weights.valueWeights;
  let baseValue =
    vw.impact * norm(impact_base) +
    vw.execution * norm(execution_quality) +
    vw.difficulty * norm(difficulty);

  if (vw.noveltyTerm) {
    baseValue += vw.noveltyTerm * norm(novelty);
  }

  const noveltyBonus = Math.min(0.1, weights.noveltyBonusRate * norm(novelty));
  const riskBonus = Math.min(0.05, weights.riskBonusRate * norm(risk));

  const value = baseValue + noveltyBonus + riskBonus;

  return {
    difficulty,
    impact_base,
    execution_quality,
    novelty,
    risk,
    value,
  };
}
