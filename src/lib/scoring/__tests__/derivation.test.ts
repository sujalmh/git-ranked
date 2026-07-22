import { describe, expect, it } from 'vitest';
import { derive } from '../derivation';
import { BALANCED_DERIVATION_WEIGHTS, PROFILE_PRESETS } from '../profiles';
import type { Facts } from '../types';

const defaultFacts: Facts = {
  scope: 'trivial',
  user_visible: false,
  breaking_change: false,
  cross_cutting: false,
  testing_added: false,
  documentation_updated: false,
  new_algorithm_or_subsystem: false,
  boilerplate: false,
  touches_auth: false,
  touches_data_migration: false,
  touches_distributed_state: false,
  touches_architecture: false,
};

describe('derivation logic (facts -> derived)', () => {
  it('verifies motivating example: high difficulty + low impact scores lower than low difficulty + high impact', () => {
    // High difficulty, low impact
    const highDiffLowImpact: Facts = {
      ...defaultFacts,
      scope: 'trivial',
      cross_cutting: true,
      new_algorithm_or_subsystem: true, // difficulty = 1 + 1 + 1 = 3
      user_visible: false,               // impact = 1
    };

    // Low difficulty, high impact
    const lowDiffHighImpact: Facts = {
      ...defaultFacts,
      scope: 'trivial',
      cross_cutting: false,
      new_algorithm_or_subsystem: false, // difficulty = 1
      user_visible: true,
      breaking_change: true,             // impact = 1 + 1 + 1 = 3
    };

    const derivedHighDiff = derive(highDiffLowImpact, BALANCED_DERIVATION_WEIGHTS);
    const derivedHighImpact = derive(lowDiffHighImpact, BALANCED_DERIVATION_WEIGHTS);

    expect(derivedHighDiff.difficulty).toBeGreaterThan(derivedHighImpact.difficulty);
    expect(derivedHighImpact.impact_base).toBeGreaterThan(derivedHighDiff.impact_base);
    expect(derivedHighImpact.value).toBeGreaterThan(derivedHighDiff.value);
  });

  it('correctly applies profile deltas', () => {
    const docFacts: Facts = {
      ...defaultFacts,
      documentation_updated: true,
      user_visible: false,
    };

    const balancedDerived = derive(docFacts, PROFILE_PRESETS.balanced.derivation_weights);
    const openSourceDerived = derive(docFacts, PROFILE_PRESETS.open_source.derivation_weights);

    // Open source treats documentation as user visible
    expect(openSourceDerived.impact_base).toBeGreaterThan(balancedDerived.impact_base);
  });
});
