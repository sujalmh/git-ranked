import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRepoScoringConfig, scoreRepo } from '@/lib/scoring';
import type { DimensionScores } from '@/lib/scoring';

type ContributorSummary = {
  id: number;
  username: string;
  avatar_url: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;

  try {
    const repoQuery = await sql`SELECT id FROM repositories WHERE owner = ${owner} AND name = ${name}`;
    if (repoQuery.length === 0) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }
    const repoId = repoQuery[0].id;
    const config = await getRepoScoringConfig(repoId);

    // Fetch stored dimension scores for repo
    let scoreRows = await sql`
      SELECT contributor_id, decay_profile, impact, quality, collaboration, consistency, composite,
             window_start, window_end, scoring_config_version, computed_at
      FROM dimension_scores
      WHERE repo_id = ${repoId} AND scoring_config_version = ${config.version}
    `;

    // If no scores computed yet, trigger scoreRepo
    if (scoreRows.length === 0) {
      const computed = await scoreRepo(repoId);
      scoreRows = computed.map((s) => ({
        contributor_id: s.contributor_id,
        decay_profile: s.decay_profile,
        impact: s.impact,
        quality: s.quality,
        collaboration: s.collaboration,
        consistency: s.consistency,
        composite: s.composite,
        window_start: s.window_start,
        window_end: s.window_end,
        scoring_config_version: s.scoring_config_version,
        computed_at: s.computed_at,
      }));
    }

    const contributorQuery = await sql`
      SELECT id, username, avatar_url FROM github_contributors
      WHERE id IN (SELECT DISTINCT contributor_id FROM github_events WHERE repo_id = ${repoId})
        AND username NOT ILIKE '%[bot]%'
    `;

    const contribMap = new Map<number, ContributorSummary>();
    for (const c of contributorQuery) {
      contribMap.set(c.id, { id: c.id, username: c.username, avatar_url: c.avatar_url });
    }

    const byContributor = new Map<number, { current?: DimensionScores; all_time?: DimensionScores }>();

    for (const row of scoreRows) {
      const cid = row.contributor_id as number;
      const existing = byContributor.get(cid) ?? {};
      const scoreObj: DimensionScores = {
        contributor_id: cid,
        repo_id: repoId,
        decay_profile: row.decay_profile,
        impact: row.impact,
        quality: row.quality,
        collaboration: row.collaboration,
        consistency: row.consistency,
        composite: row.composite,
        window_start: row.window_start,
        window_end: row.window_end,
        scoring_config_version: row.scoring_config_version,
        computed_at: row.computed_at,
      };

      if (row.decay_profile === 'current') existing.current = scoreObj;
      else existing.all_time = scoreObj;

      byContributor.set(cid, existing);
    }

    const contributorsList = Array.from(byContributor.entries()).map(([cid, scorePair]) => {
      const contributor = contribMap.get(cid) ?? { id: cid, username: `user-${cid}`, avatar_url: null };
      const fallbackScore: DimensionScores = {
        contributor_id: cid,
        repo_id: repoId,
        decay_profile: 'current',
        impact: 0,
        quality: 0,
        collaboration: 0,
        consistency: 0,
        composite: 0,
        scoring_config_version: config.version,
      };

      return {
        contributor,
        current: scorePair.current ?? fallbackScore,
        all_time: scorePair.all_time ?? { ...fallbackScore, decay_profile: 'all_time' },
      };
    });

    contributorsList.sort((a, b) => b.current.composite - a.current.composite);

    return NextResponse.json({
      contributors: contributorsList,
      scoringConfigVersion: config.version,
    });
  } catch (error) {
    console.error('Failed to fetch scores:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
