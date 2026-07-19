export interface RawEvent {
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
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

const BASE_POINTS: Record<string, number> = {
  push: 10,
  pr_opened: 2,
  pr_merged: 10,
  pr_closed: 1,
  review_submitted: 10,
  issue_opened: 4,
  issue_closed: 3,
  release: 12,
  discussion: 2,
  comment: 1,
};

function isFixOrRefactor(payload: Record<string, unknown>, type: string): boolean {
  if (type !== 'pr_merged' && type !== 'push') return false;
  const title = (
    typeof payload.title === 'string' ? payload.title :
    typeof payload.message === 'string' ? payload.message :
    ''
  ).toLowerCase();
  
  // Checking commits array inside push
  if (type === 'push' && Array.isArray(payload.commits)) {
    const messages = payload.commits.map(c => typeof c === 'object' && c && 'message' in c ? String(c.message).toLowerCase() : '').join(' ');
    if (['fix', 'bug', 'error', 'refactor', 'perf', 'test'].some(w => messages.includes(w))) return true;
  }

  return ['fix', 'bug', 'error', 'refactor', 'perf', 'test'].some(w => title.includes(w));
}

export function computeContributionScore(events: RawEvent[]): ScoreDetails {
  const breakdown = {
    featureDelivery: 0,
    codeQuality: 0,
    reviews: 0,
    collaboration: 0,
    consistency: 0,
  };

  const activeDays = new Set<string>();

  for (const event of events) {
    const dateStr = new Date(event.created_at).toISOString().split('T')[0];
    activeDays.add(dateStr);
    
    const type = event.type;
    const base = BASE_POINTS[type] || 0;
    const payload = event.payload || {};

    let points = base;

    if (type === 'pr_merged') {
      const changed = (typeof payload.additions === 'number' ? payload.additions : 0) + 
                      (typeof payload.deletions === 'number' ? payload.deletions : 0);
      if (changed >= 200) points *= 2.5;
      else if (changed >= 50) points *= 1.5;

      if (isFixOrRefactor(payload, type)) {
        breakdown.codeQuality += points;
      } else {
        breakdown.featureDelivery += points;
      }
    } else if (type === 'push') {
      if (isFixOrRefactor(payload, type)) {
        breakdown.codeQuality += points;
      } else {
        breakdown.featureDelivery += points;
      }
    } else if (type === 'review_submitted') {
      if (payload.state === 'approved' || payload.state === 'changes_requested') {
        points *= 1.5;
      }
      const wordCount = typeof payload.word_count === 'number' ? payload.word_count : 0;
      if (wordCount > 50) points *= 1.5;
      
      breakdown.reviews += points;
    } else if (type === 'issue_opened' || type === 'pr_opened') {
      breakdown.collaboration += points;
    } else if (type === 'issue_closed') {
      if (isFixOrRefactor(payload, type)) breakdown.codeQuality += points;
      else breakdown.featureDelivery += points;
    } else if (type === 'release') {
      breakdown.featureDelivery += points;
    } else {
      breakdown.collaboration += points;
    }
  }

  // Consistency score: points based on the number of active days (capped at 50)
  breakdown.consistency = Math.min(50, activeDays.size * 2.5);

  const total = breakdown.featureDelivery + breakdown.codeQuality + breakdown.reviews + breakdown.collaboration + breakdown.consistency;

  return {
    total: Math.round(total * 10) / 10,
    breakdown: {
      featureDelivery: Math.round(breakdown.featureDelivery * 10) / 10,
      codeQuality: Math.round(breakdown.codeQuality * 10) / 10,
      reviews: Math.round(breakdown.reviews * 10) / 10,
      collaboration: Math.round(breakdown.collaboration * 10) / 10,
      consistency: Math.round(breakdown.consistency * 10) / 10,
    }
  };
}
