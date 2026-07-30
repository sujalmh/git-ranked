import { sql } from '../db';
import { PROFILE_PRESETS } from './profiles';

export async function seedScoringConfigs() {
  console.log('Seeding scoring_config presets...');
  for (const [name, preset] of Object.entries(PROFILE_PRESETS)) {
    const existing = await sql`
      SELECT id FROM scoring_config
      WHERE profile = ${name}
        AND repo_id IS NULL
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO scoring_config (
          version, profile, repo_id, derivation_weights, value_weights, caps, decay_half_life_days
        ) VALUES (
          ${preset.version},
          ${name},
          NULL,
          ${JSON.stringify(preset.derivation_weights)},
          ${JSON.stringify(preset.value_weights)},
          ${JSON.stringify(preset.caps)},
          ${preset.decay_half_life_days}
        )
      `;
      console.log(`Seeded preset profile: ${name}`);
    } else {
      await sql`
        UPDATE scoring_config
        SET version = ${preset.version},
            derivation_weights = ${JSON.stringify(preset.derivation_weights)},
            value_weights = ${JSON.stringify(preset.value_weights)},
            caps = ${JSON.stringify(preset.caps)},
            decay_half_life_days = ${preset.decay_half_life_days}
        WHERE id = ${existing[0].id}
      `;
      console.log(`Updated preset profile: ${name} to ${preset.version}`);
    }
  }
  console.log('Scoring config presets seeded.');
}
