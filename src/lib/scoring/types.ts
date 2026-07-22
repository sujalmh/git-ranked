export type WorkType =
  | 'Feature'
  | 'BugFix'
  | 'Refactor'
  | 'Performance'
  | 'Security'
  | 'Documentation'
  | 'Testing'
  | 'Infrastructure'
  | 'Review';

export type Scope = 'trivial' | 'small' | 'medium' | 'large' | 'system_wide';

export interface Facts {
  scope: Scope;
  user_visible: boolean;
  breaking_change: boolean;
  cross_cutting: boolean;
  testing_added: boolean;
  documentation_updated: boolean;
  new_algorithm_or_subsystem: boolean;
  boilerplate: boolean;
  touches_auth: boolean;
  touches_data_migration: boolean;
  touches_distributed_state: boolean;
  touches_architecture: boolean;
}

export interface ReviewFacts {
  substantiveness: 'rubber_stamp' | 'light' | 'moderate' | 'thorough';
  blocking_issue_found: boolean;
  confirmed_valid: boolean;
}

export interface OutcomeFacts {
  issue_closed_referencing_pr?: boolean;
  released?: boolean;
  unblocked_downstream?: boolean;
}

export interface Derived {
  difficulty: number;
  impact_base: number;
  execution_quality: number;
  novelty: number;
  risk: number;
  value: number;
}

export interface Rationale {
  impact_reason: string;
  quality_reason: string;
}

export interface SizeMetrics {
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface WorkUnit {
  id?: number;
  repo_id: number;
  candidate_id: number;
  work_type: WorkType;
  summary?: string | null;
  facts: Facts | ReviewFacts;
  derived: Derived;
  derivation_ruleset_version: string;
  extraction_confidence: number;
  extraction_source: 'ai' | 'heuristic_fallback' | 'ai_facts_corrected';
  flagged_for_review: boolean;
  shipped: boolean;
  outcome?: OutcomeFacts | null;
  outcome_updated_at?: string | null;
  size_metrics?: SizeMetrics | null;
  rationale: Rationale;
  created_at?: string;
  shipped_at?: string | null;
  source_event_ids: number[];
}

export type ProfileName = 'balanced' | 'product' | 'infrastructure' | 'open_source' | 'research';

export interface ValueWeights {
  impact: number;
  execution: number;
  difficulty: number;
  noveltyTerm?: number;
}

export interface DerivationWeights {
  difficulty: {
    scopeBase: Record<Scope, number>;
    crossCuttingBonus: number;
    newSubsystemBonus: number;
    boilerplatePenalty: number;
  };
  impact: {
    scopeBase: Record<Scope, number>;
    userVisibleBonus: number;
    breakingChangeBonus: number;
    documentationAsUserVisible?: boolean;
    outcome: {
      issueClosedBonus: number;
      releasedBonus: number;
      unblockedBonus: number;
      outcomeCap: number;
    };
  };
  execution: {
    base: number;
    testingAddedBonus: number;
    documentationBonus: number;
  };
  novelty: {
    base: number;
    newSubsystemBonus: number;
    touchesArchitectureBonus: number;
    boilerplatePenalty: number;
  };
  risk: {
    base: number;
    authBonus: number;
    migrationBonus: number;
    distributedStateBonus: number;
    breakingChangeBonus: number;
  };
  valueWeights: ValueWeights;
  noveltyBonusRate: number;
  riskBonusRate: number;
}

export interface Caps {
  impact: number;
  quality: number;
  collaboration: number;
  consistency: number;
  compositeWeights: {
    impact: number;
    quality: number;
    collaboration: number;
    consistency: number;
  };
}

export interface ScoringConfig {
  id?: number;
  version: string;
  repo_id?: number | null;
  profile: ProfileName;
  derivation_weights: DerivationWeights;
  value_weights: ValueWeights;
  caps: Caps;
  decay_half_life_days: number;
}

export interface DimensionScores {
  contributor_id: number;
  repo_id: number;
  window_start?: string | null;
  window_end?: string | null;
  decay_profile: 'current' | 'all_time';
  impact: number;
  quality: number;
  collaboration: number;
  consistency: number;
  composite: number;
  scoring_config_version: string;
  computed_at?: string;
}

export interface RawEvent {
  id: number;
  event_type: string;
  type?: string;
  payload: Record<string, unknown>;
  created_at: string;
  contributor_id: number;
  username: string;
  before_sha?: string | null;
  after_sha?: string | null;
}

export interface ScoreDetails {
  total: number;
  breakdown: {
    featureDelivery: number;
    codeQuality: number;
    reviews: number;
    collaboration: number;
    consistency: number;
  };
}

export type ClassificationMap = Map<number, any>;
