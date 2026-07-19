import { sql } from './db';

export async function getRepoInsights(repoId: number) {
  // 1. Basic Pulse (Last 30 days events)
  const pulseEvents = await sql`
    SELECT event_type, created_at
    FROM github_events
    WHERE repo_id = ${repoId} AND created_at > NOW() - INTERVAL '30 days'
  `;

  const eventCountsByDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    eventCountsByDay[d.toISOString().split('T')[0]] = 0;
  }

  pulseEvents.forEach(e => {
    const dateStr = e.created_at.toISOString().split('T')[0];
    if (eventCountsByDay[dateStr] !== undefined) {
      eventCountsByDay[dateStr]++;
    }
  });

  const pulseData = Object.keys(eventCountsByDay).map(date => ({
    date,
    events: eventCountsByDay[date]
  }));

  // 2. PR Health
  const prEvents = await sql`
    SELECT event_type, payload, created_at 
    FROM github_events 
    WHERE repo_id = ${repoId} AND event_type IN ('pr_opened', 'pr_merged', 'pr_closed')
  `;

  let totalOpened = 0;
  let totalMerged = 0;
  let totalClosed = 0;

  prEvents.forEach(e => {
    if (e.event_type === 'pr_opened') totalOpened++;
    else if (e.event_type === 'pr_merged') totalMerged++;
    else if (e.event_type === 'pr_closed') totalClosed++;
  });

  const mergeRate = totalOpened > 0 ? (totalMerged / (totalMerged + totalClosed || 1)) * 100 : 0;

  // 3. Active Contributors (Last 30 days)
  const activeContributors = await sql`
    SELECT COUNT(DISTINCT contributor_id) as count
    FROM github_events
    WHERE repo_id = ${repoId} AND created_at > NOW() - INTERVAL '30 days'
  `;

  return {
    pulseData,
    prHealth: {
      opened: totalOpened,
      merged: totalMerged,
      closed: totalClosed,
      mergeRate: Math.round(mergeRate)
    },
    activeContributors: parseInt(activeContributors[0].count) || 0,
  };
}
