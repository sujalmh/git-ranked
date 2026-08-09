import type { DerivationWeights, ProfileName, ScoringConfig, Caps } from './types';

export const DEFAULT_CAPS: Caps = {
  impact: 100,
  quality: 100,
  collaboration: 100,
  consistency: 100,
  compositeWeights: {
    impact: 0.7,
    quality: 0.15,
    collaboration: 0.1,
    consistency: 0.05,
  },
};

export const BALANCED_DERIVATION_WEIGHTS: DerivationWeights = {
  difficulty: {
    scopeBase: { trivial: 1, small: 2, medium: 3, large: 4, system_wide: 5 },
    crossCuttingBonus: 1,
    newSubsystemBonus: 1,
    boilerplatePenalty: -1,
  },
  impact: {
    scopeBase: { trivial: 1, small: 2, medium: 3, large: 4, system_wide: 5 },
    userVisibleBonus: 1,
    breakingChangeBonus: 1,
    documentationAsUserVisible: false,
    outcome: {
      issueClosedBonus: 1,
      releasedBonus: 1,
      unblockedBonus: 1,
      outcomeCap: 2,
    },
  },
  execution: {
    base: 1,
    testingAddedBonus: 1,
    documentationBonus: 1,
  },
  novelty: {
    base: 2,
    newSubsystemBonus: 2,
    touchesArchitectureBonus: 1,
    boilerplatePenalty: -1,
  },
  risk: {
    base: 1,
    authBonus: 1,
    migrationBonus: 1,
    distributedStateBonus: 1,
    breakingChangeBonus: 1,
  },
  valueWeights: {
    impact: 0.5,
    execution: 0.3,
    difficulty: 0.2,
  },
  noveltyBonusRate: 0.1,
  riskBonusRate: 0.1,
};

export const PROFILE_PRESETS: Record<ProfileName, Omit<ScoringConfig, 'id'>> = {
  balanced: {
    version: 'v5.0',
    profile: 'balanced',
    repo_id: null,
    derivation_weights: BALANCED_DERIVATION_WEIGHTS,
    value_weights: BALANCED_DERIVATION_WEIGHTS.valueWeights,
    caps: DEFAULT_CAPS,
    decay_half_life_days: 60,
  },
  product: {
    version: 'v5.0',
    profile: 'product',
    repo_id: null,
    derivation_weights: {
      ...BALANCED_DERIVATION_WEIGHTS,
      impact: {
        ...BALANCED_DERIVATION_WEIGHTS.impact,
        userVisibleBonus: 2,
        outcome: {
          ...BALANCED_DERIVATION_WEIGHTS.impact.outcome,
          outcomeCap: 3,
        },
      },
    },
    value_weights: BALANCED_DERIVATION_WEIGHTS.valueWeights,
    caps: DEFAULT_CAPS,
    decay_half_life_days: 60,
  },
  infrastructure: {
    version: 'v5.0',
    profile: 'infrastructure',
    repo_id: null,
    derivation_weights: {
      ...BALANCED_DERIVATION_WEIGHTS,
      difficulty: {
        ...BALANCED_DERIVATION_WEIGHTS.difficulty,
        crossCuttingBonus: 2,
      },
      execution: {
        ...BALANCED_DERIVATION_WEIGHTS.execution,
        testingAddedBonus: 2,
      },
      novelty: {
        ...BALANCED_DERIVATION_WEIGHTS.novelty,
        touchesArchitectureBonus: 2,
      },
    },
    value_weights: BALANCED_DERIVATION_WEIGHTS.valueWeights,
    caps: DEFAULT_CAPS,
    decay_half_life_days: 60,
  },
  open_source: {
    version: 'v5.0',
    profile: 'open_source',
    repo_id: null,
    derivation_weights: {
      ...BALANCED_DERIVATION_WEIGHTS,
      impact: {
        ...BALANCED_DERIVATION_WEIGHTS.impact,
        documentationAsUserVisible: true,
      },
      execution: {
        ...BALANCED_DERIVATION_WEIGHTS.execution,
        documentationBonus: 2,
      },
    },
    value_weights: BALANCED_DERIVATION_WEIGHTS.valueWeights,
    caps: DEFAULT_CAPS,
    decay_half_life_days: 60,
  },
  research: {
    version: 'v5.0',
    profile: 'research',
    repo_id: null,
    derivation_weights: {
      ...BALANCED_DERIVATION_WEIGHTS,
      valueWeights: {
        impact: 0.35,
        execution: 0.2,
        difficulty: 0.25,
        noveltyTerm: 0.2,
      },
      noveltyBonusRate: 0.15,
    },
    value_weights: {
      impact: 0.35,
      execution: 0.2,
      difficulty: 0.25,
      noveltyTerm: 0.2,
    },
    caps: DEFAULT_CAPS,
    decay_half_life_days: 60,
  },
};
