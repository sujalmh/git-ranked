export interface RawEvent {
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ScoreDetails {
  total: number;
  pushScore: number;
  prScore: number;
  reviewScore: number;
  issueScore: number;
  releaseScore: number;
}

const BASE_POINTS: Record<string, number> = {
  push: 3,
  pr_opened: 6,
  pr_merged: 15,
  pr_closed: 1,
  review_submitted: 8,
  issue_opened: 3,
  issue_closed: 2,
  release: 12,
};

export function computeContributionScore(events: RawEvent[]): ScoreDetails {
  const score: ScoreDetails = {
    total: 0,
    pushScore: 0,
    prScore: 0,
    reviewScore: 0,
    issueScore: 0,
    releaseScore: 0,
  };

  // Group events by day to compute diminishing returns
  const eventsByDayAndType: Record<string, Record<string, number>> = {};

  for (const event of events) {
    const dateStr = new Date(event.created_at).toISOString().split('T')[0];
    if (!eventsByDayAndType[dateStr]) {
      eventsByDayAndType[dateStr] = {};
    }
    const type = event.type;
    const typeCount = (eventsByDayAndType[dateStr][type] || 0) + 1;
    eventsByDayAndType[dateStr][type] = typeCount;

    const base = BASE_POINTS[type] || 0;
    let multiplier = 1.0;

    // Apply Impact Multipliers
    if (type === 'pr_merged') {
      const additions = typeof event.payload.additions === 'number' ? event.payload.additions : 0;
      const deletions = typeof event.payload.deletions === 'number' ? event.payload.deletions : 0;
      const changed = additions + deletions;
      if (changed >= 100) multiplier = 2.5;
      else if (changed >= 30) multiplier = 2.0;
      else if (changed >= 10) multiplier = 1.5;
    } else if (type === 'review_submitted') {
      if (event.payload.state === 'approved' || event.payload.state === 'changes_requested') {
        multiplier = 1.5;
      } else if (event.payload.state === 'commented') {
        const wordCount = typeof event.payload.word_count === 'number' ? event.payload.word_count : 0;
        if (wordCount < 20) multiplier = 0.5;
      }
      const wordCount = typeof event.payload.word_count === 'number' ? event.payload.word_count : 0;
      if (wordCount > 50) {
        multiplier += 0.5;
      }
    } else if (type === 'push') {
      const commits = Array.isArray(event.payload.commits) ? event.payload.commits : [];
      const msgs = commits
        .map(commit => {
          if (typeof commit !== 'object' || commit === null || !('message' in commit)) return '';
          return typeof commit.message === 'string' ? commit.message : '';
        })
        .join(' ');
      const commitCount = typeof event.payload.commit_count === 'number' ? event.payload.commit_count : 1;
      if (msgs.length / commitCount > 50) {
        multiplier = 1.5;
      }
    }

    // Apply Diminishing Returns
    // effective_points = base × impact_multiplier × (1 / (1 + 0.1 × (n - 1)))
    const diminishingFactor = 1 / (1 + 0.1 * (typeCount - 1));
    const effectivePoints = base * multiplier * diminishingFactor;

    score.total += effectivePoints;

    if (type === 'push') score.pushScore += effectivePoints;
    else if (type.startsWith('pr_')) score.prScore += effectivePoints;
    else if (type === 'review_submitted') score.reviewScore += effectivePoints;
    else if (type.startsWith('issue_')) score.issueScore += effectivePoints;
    else if (type === 'release') score.releaseScore += effectivePoints;
  }

  // Round all scores to 1 decimal place
  for (const key of Object.keys(score) as (keyof ScoreDetails)[]) {
    score[key] = Math.round(score[key] * 10) / 10;
  }

  return score;
}
