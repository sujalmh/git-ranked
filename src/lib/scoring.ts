import type { ClassificationItem, WorkType } from './ai/types';

export interface RawEvent {
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  id?: number;
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
  push: 1,
  pr_opened: 1,
  pr_merged: 10,
  pr_closed: 1,
  review_submitted: 10,
  issue_opened: 2,
  issue_closed: 3,
  release: 12,
  discussion: 2,
  comment: 0.5,
};

export const WORK_TYPE_MULTIPLIER: Record<WorkType, number> = {
  Feature: 1.0,
  'Bug Fix': 0.9,
  Performance: 1.2,
  Security: 1.3,
  Refactor: 1.0,
  Infrastructure: 1.0,
  Documentation: 0.7,
  Testing: 1.1,
  Database: 1.0,
  API: 1.0,
  Frontend: 1.0,
  Backend: 1.0,
  Other: 1.0,
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

export type ClassificationMap = Map<number, ClassificationItem>;

export interface ScoringOptions {
  classifications?: ClassificationMap;
}

export function computeContributionScore(
  events: RawEvent[],
  options: ScoringOptions = {}
): ScoreDetails {
  const { classifications } = options;
  const breakdown = {
    featureDelivery: 0,
    codeQuality: 0,
    reviews: 0,
    collaboration: 0,
    consistency: 0,
  };

  const activeDays = new Set<string>();
  let minTime = Infinity;
  let maxTime = -Infinity;

  const commentCount = { value: 0 };
  const issueOpenedCount = { value: 0 };
  const pushCount = { value: 0 };
  const pushContentAccrued = { value: 0 };

  for (const event of events) {
    const ts = new Date(event.created_at).getTime();
    if (Number.isFinite(ts)) {
      if (ts < minTime) minTime = ts;
      if (ts > maxTime) maxTime = ts;
    }
    const dateStr = new Date(event.created_at).toISOString().split('T')[0];
    activeDays.add(dateStr);

    const type = event.type;
    const base = BASE_POINTS[type] || 0;
    const payload = event.payload || {};

    let points = base;

    if (type === 'push') {
      pushCount.value += 1;
      const commitCount =
        (typeof payload.commit_count === 'number' && payload.commit_count > 0
          ? payload.commit_count
          : 0) ||
        (Array.isArray(payload.commits) ? payload.commits.length : 0) ||
        1;
      const overhead = base / (1 + 0.2 * (pushCount.value - 1));
      const remaining = Math.max(0, 25 - pushContentAccrued.value);
      const contentBonus = Math.min(remaining, commitCount);
      pushContentAccrued.value += contentBonus;
      points = overhead + contentBonus;
    } else if (type === 'comment') {
      commentCount.value += 1;
      points = base / (1 + 0.15 * (commentCount.value - 1));
    } else if (type === 'issue_opened') {
      issueOpenedCount.value += 1;
      points = base / (1 + 0.1 * (issueOpenedCount.value - 1));
    }

    if (classifications && event.id) {
      const classification = classifications.get(event.id);
      if (classification?.work_type) {
        const multiplier = WORK_TYPE_MULTIPLIER[classification.work_type as WorkType] ?? 1.0;
        points *= multiplier;
      }
    }

    if (type === 'pr_merged') {
      const additions = typeof payload.additions === 'number' ? payload.additions : 0;
      const deletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
      const changedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;
      const changed = additions + deletions;
      const linesBonus = Math.min(20, Math.log10(changed + 1) * 4);
      const filesBonus = Math.min(12, changedFiles * 0.6);
      points += linesBonus + filesBonus;

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

  const spanDays =
    Number.isFinite(minTime) && Number.isFinite(maxTime)
      ? Math.max(1, Math.round((maxTime - minTime) / 86_400_000) + 1)
      : 1;
  const activeRatio = activeDays.size / spanDays;
  const breadth = Math.min(activeDays.size, 30);
  const regularity = activeDays.size >= 3 ? activeRatio * 30 : activeRatio * 10;
  breakdown.consistency = Math.min(50, breadth + regularity);

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

export function computeScoreBaseline(
  eventsByContributor: Map<number, RawEvent[]>,
  classifications?: ClassificationMap,
): { topScore: number; scoresByContributor: Map<number, ScoreDetails> } {
  const scoresByContributor = new Map<number, ScoreDetails>();
  let topScore = 1;
  for (const [contributorId, events] of eventsByContributor) {
    const score = computeContributionScore(events, { classifications });
    scoresByContributor.set(contributorId, score);
    if (score.total > topScore) topScore = score.total;
  }
  return { topScore, scoresByContributor };
}

export function normalizeScoreToImpact(score: ScoreDetails, topScore: number): ScoreDetails {
  const factor = topScore > 0 ? 100 / topScore : 0;
  const scale = (v: number) => Math.round(v * factor * 10) / 10;
  return {
    total: Math.max(1, Math.round(score.total * factor)),
    breakdown: {
      featureDelivery: scale(score.breakdown.featureDelivery),
      codeQuality: scale(score.breakdown.codeQuality),
      reviews: scale(score.breakdown.reviews),
      collaboration: scale(score.breakdown.collaboration),
      consistency: scale(score.breakdown.consistency),
    },
  };
}
