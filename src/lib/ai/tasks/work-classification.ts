import { z } from 'zod';
import { sql } from '../../db';
import { callStructured, hasApiKey } from '../openrouter';
import { classifyEventsFallback } from '../fallback';
import { ClassificationSchema } from '../schemas';
import { asPayload, titleFromPayload } from '../../contributor-insights';
import type { Classification, ClassificationItem, NormalizedEvent } from '../types';

const BATCH_SIZE = 25;

export type UnclassifiedRow = {
  id: number;
  event_type: string;
  payload: unknown;
  created_at: Date | string;
  username: string;
};

export async function fetchUnclassifiedEvents(
  repoId: number,
  dateFrom?: string,
  dateTo?: string,
  contributorId?: number,
  limit = 100
): Promise<UnclassifiedRow[]> {
  const hasDateRange = Boolean(dateFrom && dateTo);

  if (contributorId && hasDateRange) {
    return (await sql`
      SELECT e.id, e.event_type, e.payload, e.created_at, c.username
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
        AND e.contributor_id = ${contributorId}
        AND e.classification IS NULL
        AND e.created_at >= ${dateFrom}::date
        AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
      ORDER BY e.created_at ASC
      LIMIT ${limit}
    `) as UnclassifiedRow[];
  }

  if (contributorId) {
    return (await sql`
      SELECT e.id, e.event_type, e.payload, e.created_at, c.username
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
        AND e.contributor_id = ${contributorId}
        AND e.classification IS NULL
        AND e.created_at > NOW() - INTERVAL '90 days'
      ORDER BY e.created_at ASC
      LIMIT ${limit}
    `) as UnclassifiedRow[];
  }

  if (hasDateRange) {
    return (await sql`
      SELECT e.id, e.event_type, e.payload, e.created_at, c.username
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
        AND c.username NOT ILIKE '%[bot]%'
        AND e.classification IS NULL
        AND e.created_at >= ${dateFrom}::date
        AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
      ORDER BY e.created_at ASC
      LIMIT ${limit}
    `) as UnclassifiedRow[];
  }

  return (await sql`
    SELECT e.id, e.event_type, e.payload, e.created_at, c.username
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
      AND c.username NOT ILIKE '%[bot]%'
      AND e.classification IS NULL
      AND e.created_at > NOW() - INTERVAL '90 days'
    ORDER BY e.created_at ASC
    LIMIT ${limit}
  `) as UnclassifiedRow[];
}

function buildClassificationPrompt(events: NormalizedEvent[], repoOwner: string, repoName: string) {
  const eventBlock = events
    .map((e) => `[${e.id}] ${e.createdAt} ${e.username} - ${e.type}: ${e.title}`)
    .join('\n');

  const system = `You are an Engineering Intelligence analyzer. Classify engineering work from GitHub events.

Repository: ${repoOwner}/${repoName}

For each event, assign two classifications:

1. work_type — the KIND of work, exactly one from:
Feature, Bug Fix, Performance, Security, Refactor, Infrastructure, Documentation, Testing, Database, API, Frontend, Backend, Other

2. work_areas — ALL the product DOMAINS / surface areas the work touches. A single event can span multiple areas (e.g. a PR touching both API and Database should list both). Derive each area from the evidence in the event (title, type, changed files, technologies). Use concrete domain labels — for example: API, UI, Database, Auth, AI, Backend, Infrastructure, Documentation, Testing, DevOps, Security, Mobile, Data, Payments, Billing, Search, Notifications, or another domain that best describes WHERE in the product this work lands. Include every domain that is clearly supported by the evidence; use ["Other"] only when no domain is evident.

Rules:
- Base classifications ONLY on the evidence provided (event title, type).
- Do NOT infer technologies that are not directly observable.
- Include a confidence score (0-1) reflecting how certain you are.
- Keep reasoning concise (one sentence).
- If uncertain, use ["Other"] with low confidence.`;

  const user = `Classify each of the following ${events.length} event(s). Respond as JSON matching this schema:
{ "items": [{ "event_id": number, "categories": string[], "work_type": string, "work_areas": string[], "technologies": string[], "confidence": number, "reasoning": string }] }

Events:
${eventBlock}`;

  return { system, user };
}

function stripCodeFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }
  return cleaned;
}

async function persistClassifications(items: ClassificationItem[]): Promise<void> {
  for (const item of items) {
    await sql`
      UPDATE github_events
      SET classification = ${JSON.stringify(item)},
          classified_at = NOW()
      WHERE id = ${item.event_id}
    `;
  }
}

function rowsToNormalized(rows: UnclassifiedRow[]): NormalizedEvent[] {
  return rows.map((row) => {
    const payload = asPayload(row.payload);
    return {
      id: row.id,
      type: row.event_type,
      username: row.username,
      createdAt: new Date(row.created_at).toISOString(),
      title: titleFromPayload(row.event_type, payload),
      description: '',
      category: '',
    };
  });
}

export async function classifyEvents(
  repoId: number,
  repoOwner: string,
  repoName: string,
  dateFrom?: string,
  dateTo?: string,
  contributorId?: number
): Promise<{ classified: number; fallback: number }> {
  const unclassified = await fetchUnclassifiedEvents(repoId, dateFrom, dateTo, contributorId);

  if (unclassified.length === 0) {
    return { classified: 0, fallback: 0 };
  }

  const normalized = rowsToNormalized(unclassified);
  let classifiedCount = 0;
  let fallbackCount = 0;

  const jsonSchema = z.toJSONSchema(ClassificationSchema) as Record<string, unknown>;

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    let handled = false;

    if (hasApiKey()) {
      const { system, user } = buildClassificationPrompt(batch, repoOwner, repoName);

      try {
        const content = await callStructured(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          jsonSchema,
          'work_classification'
        );

        if (content) {
          const parsed = JSON.parse(stripCodeFences(content));
          const validated = ClassificationSchema.safeParse(parsed);
          if (validated.success) {
            const items = validated.data.items;
            if (items.length === batch.length || items.length > 0) {
              await persistClassifications(items);
              classifiedCount += items.length;
              handled = true;
            }
          }
        }
      } catch (error) {
        console.warn('AI classification failed for batch, using fallback:', error instanceof Error ? error.message : error);
      }
    }

    if (!handled) {
      const fallbackResult = classifyEventsFallback(batch);
      await persistClassifications(fallbackResult.items);
      fallbackCount += fallbackResult.items.length;
    }
  }

  return { classified: classifiedCount, fallback: fallbackCount };
}

export type ClassificationResult = Classification;
