import { sql } from '../db';
import { PROFILE_PRESETS } from './profiles';
import { DEFAULT_IMPACT_PROGRESS } from './goals';
import type { ProfileName, ScoringConfig } from './types';

export async function getRepoScoringConfig(repoId: number): Promise<ScoringConfig> {
  const repoRow = await sql`
    SELECT scoring_profile FROM repositories WHERE id = ${repoId}
  `;

  const profileName: ProfileName = (repoRow[0]?.scoring_profile as ProfileName) || 'balanced';

  const configRow = await sql`
    SELECT id, version, repo_id, profile, derivation_weights, value_weights, caps, decay_half_life_days
    FROM scoring_config
    WHERE (repo_id = ${repoId} OR repo_id IS NULL)
      AND profile = ${profileName}
    ORDER BY repo_id DESC NULLS LAST
    LIMIT 1
  `;

  if (configRow.length > 0) {
    const row = configRow[0];
    const caps = row.caps ?? {};
    // Pre-v6 config rows lack the per-node progress curve. Fall back to the
    // v6 defaults so the new scoring model works even before a re-seed.
    const capsWithProgress = caps.impactProgress
      ? caps
      : { ...caps, impactProgress: DEFAULT_IMPACT_PROGRESS };
    return {
      id: row.id,
      version: caps.impactProgress ? row.version || 'v6.0' : 'v6.0',
      repo_id: row.repo_id,
      profile: row.profile,
      derivation_weights: row.derivation_weights,
      value_weights: row.value_weights,
      caps: capsWithProgress,
      decay_half_life_days: row.decay_half_life_days ?? 60,
    };
  }

  const preset = PROFILE_PRESETS[profileName] || PROFILE_PRESETS.balanced;
  return {
    ...preset,
    repo_id: repoId,
  };
}
