/**
 * Test script: verifies the improved work-unit extraction prompt against
 * actual data from the Neon DB for the restaurant-bot repo.
 *
 * Shows before/after comparison of:
 * 1. The data extracted from events (title, commit messages, size stats)
 * 2. The prompt sent to the AI
 * 3. The AI-generated summaries (if API key is available)
 *
 * Usage: npx tsx src/scripts/test-extraction-prompt.ts
 */

import { sql } from '../lib/db';
import { callStructured, hasApiKey } from '../lib/ai/openrouter';

// Re-implement the OLD extraction logic for comparison
function oldTitleOrMessage(payload: Record<string, unknown>, eventType: string): string {
  return String(payload.title || payload.message || eventType);
}

function oldParseSizeMetrics(eventType: string, payload: Record<string, unknown>) {
  const directAdditions = typeof payload.additions === 'number' ? payload.additions : 0;
  const directDeletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
  const directChangedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;
  if (eventType === 'push') {
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const commitCount = typeof payload.commit_count === 'number' ? payload.commit_count : commits.length;
    let sumAdditions = 0, sumDeletions = 0;
    for (const c of commits) {
      if (c && typeof c === 'object') {
        const co = c as Record<string, unknown>;
        sumAdditions += typeof co.additions === 'number' ? co.additions : 0;
        sumDeletions += typeof co.deletions === 'number' ? co.deletions : 0;
      }
    }
    return { additions: sumAdditions || directAdditions, deletions: sumDeletions || directDeletions, changedFiles: directChangedFiles, commitCount };
  }
  return { additions: directAdditions, deletions: directDeletions, changedFiles: directChangedFiles, commitCount: 1 };
}

// Import the NEW extraction helpers
import {
  extractCommitMessages,
  extractBestTitle,
  extractMergedSizeMetrics,
  extractPrBody,
  buildExtractionPrompt,
  EXTRACTION_SYSTEM_MESSAGE,
} from '../lib/scoring/extract';

async function main() {
  const repoId = 4; // sujalmh/restaurant-bot

  // Load all candidates with their events
  const candidates = await sql`
    SELECT id, correlation_key, status, source_event_ids
    FROM work_unit_candidates
    WHERE repo_id = ${repoId}
    ORDER BY created_at ASC
  `;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`WORK UNIT EXTRACTION PROMPT VERIFICATION`);
  console.log(`Repo: sujalmh/restaurant-bot (id=${repoId})`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`${'='.repeat(80)}\n`);

  const useAi = hasApiKey();
  console.log(`AI API key available: ${useAi}`);
  console.log('');

  let testedCount = 0;
  const maxToTest = 6; // limit AI calls

  for (const candidate of candidates) {
    if (testedCount >= maxToTest) break;

    const events = await sql`
      SELECT id, event_type, payload, created_at
      FROM github_events
      WHERE id = ANY(${candidate.source_event_ids}::bigint[])
      ORDER BY created_at ASC
    `;

    if (events.length === 0) continue;

    const firstEvent = events[0];
    const eventType = firstEvent.event_type as string;
    const firstPayload = (firstEvent.payload || {}) as Record<string, unknown>;

    // Skip review events (they use heuristics, not AI)
    if (eventType === 'review_submitted') continue;

    console.log(`${'─'.repeat(80)}`);
    console.log(`Candidate: ${candidate.correlation_key}`);
    console.log(`Event type: ${eventType} (${events.length} events)`);
    console.log(`${'─'.repeat(80)}`);

    // ── OLD extraction (what was happening before) ──
    const oldTitle = oldTitleOrMessage(firstPayload, eventType);
    const oldSize = oldParseSizeMetrics(eventType, firstPayload);

    console.log('\n❌ OLD extraction (firstEvent only):');
    console.log(`  Title: "${oldTitle}"`);
    console.log(`  Stats: ${oldSize.changedFiles} files, +${oldSize.additions}/-${oldSize.deletions} lines, ${oldSize.commitCount} commits`);

    // ── NEW extraction (scanning all events) ──
    const eventsAsRecords = events as Array<Record<string, unknown>>;
    const newTitle = extractBestTitle(eventsAsRecords, eventType);
    const commitMessages = extractCommitMessages(eventsAsRecords);
    const prBody = extractPrBody(eventsAsRecords);
    const newSize = extractMergedSizeMetrics(eventsAsRecords);

    console.log('\n✅ NEW extraction (all events scanned):');
    console.log(`  Title: "${newTitle}"`);
    console.log(`  Stats: ${newSize.changedFiles} files, +${newSize.additions}/-${newSize.deletions} lines, ${newSize.commitCount} commits`);
    if (commitMessages.length > 0) {
      console.log(`  Commit messages (${commitMessages.length}):`);
      for (const msg of commitMessages.slice(0, 5)) {
        console.log(`    - ${msg.slice(0, 120)}`);
      }
    }
    if (prBody) {
      console.log(`  PR body: ${prBody.slice(0, 200)}...`);
    }

    // ── Build and show the prompt ──
    const prompt = buildExtractionPrompt(
      newTitle, eventType, newSize.changedFiles, newSize.additions,
      newSize.deletions, newSize.commitCount, commitMessages, prBody
    );

    console.log('\n📝 NEW prompt:');
    console.log(prompt);

    // ── Call AI and show the result ──
    if (useAi && testedCount < maxToTest) {
      try {
        console.log('\n🤖 Calling AI...');
        const response = await callStructured(
          [
            { role: 'system', content: EXTRACTION_SYSTEM_MESSAGE },
            { role: 'user', content: prompt },
          ],
          {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    work_type: { type: 'string' },
                    summary: { type: 'string' },
                    facts: { type: 'object' },
                    confidence: { type: 'number' },
                  },
                  required: ['work_type', 'summary', 'facts', 'confidence'],
                },
              },
            },
            required: ['items'],
          },
          'test_extraction'
        );

        if (response) {
          let cleaned = response.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
          }
          const parsed = JSON.parse(cleaned);
          console.log('\n✨ AI response:');
          if (parsed.items && Array.isArray(parsed.items)) {
            for (const item of parsed.items) {
              console.log(`  → [${item.work_type}] "${item.summary}" (confidence: ${item.confidence})`);
              if (item.facts) {
                const trueFacts = Object.entries(item.facts)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k);
                if (trueFacts.length > 0) {
                  console.log(`    Facts: scope=${item.facts.scope}, ${trueFacts.join(', ')}`);
                } else {
                  console.log(`    Facts: scope=${item.facts.scope}`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.log(`\n⚠️  AI call failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      testedCount++;
    }

    console.log('\n');
  }

  console.log(`${'='.repeat(80)}`);
  console.log(`VERIFICATION COMPLETE`);
  console.log(`Tested ${testedCount} candidates with AI calls`);
  console.log(`${'='.repeat(80)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
