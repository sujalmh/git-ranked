import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { backfillRepoActivity } from '@/lib/github-backfill';

const encoder = new TextEncoder();

type ProgressEvent = {
  step: string;
  status: 'running' | 'done' | 'error' | 'complete';
  message: string;
  detail?: unknown;
};

function encodeEvent(event: ProgressEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + '\n');
}

export async function POST(
  _req: Request,
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, name } = await props.params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id, i.github_installation_id, i.status as install_status
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  const repo = repoQuery[0];

  if (repo.install_status === 'deleted') {
    return NextResponse.json(
      { error: 'The GitHub App installation for this repository has been removed. Reinstall the app to track activity.' },
      { status: 410 }
    );
  }

  const existingEvents = await sql`
    SELECT COUNT(*) as cnt FROM github_events WHERE repo_id = ${repo.id}
  `;
  const eventCount = Number(existingEvents[0].cnt);

  if (eventCount > 0) {
    return NextResponse.json({
      alreadyInitialized: true,
      eventCount,
      message: 'Repository already has activity data.',
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      controller.enqueue(
        encodeEvent({
          step: 'fetching',
          status: 'running',
          message: `Fetching recent activity from GitHub for ${owner}/${name}...`,
        })
      );

      try {
        const result = await backfillRepoActivity({
          id: repo.id,
          github_installation_id: repo.github_installation_id,
          owner,
          name,
        });

        if (result.skipped) {
          controller.enqueue(
            encodeEvent({
              step: 'fetching',
              status: 'error',
              message: 'GitHub App credentials are not configured on the server.',
            })
          );
          controller.enqueue(
            encodeEvent({ step: 'init', status: 'complete', message: 'Initialization failed' })
          );
        } else {
          controller.enqueue(
            encodeEvent({
              step: 'fetching',
              status: 'done',
              message: `Fetched ${result.inserted} events from GitHub.`,
              detail: { inserted: result.inserted },
            })
          );

          if (result.inserted === 0) {
            controller.enqueue(
              encodeEvent({
                step: 'init',
                status: 'complete',
                message: 'No recent activity found on this repository.',
              })
            );
          } else {
            controller.enqueue(
              encodeEvent({
                step: 'init',
                status: 'complete',
                message: 'Repository initialized successfully.',
              })
            );
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encodeEvent({
            step: 'fetching',
            status: 'error',
            message: `Failed to fetch: ${errMsg}`,
          })
        );
        controller.enqueue(
          encodeEvent({ step: 'init', status: 'complete', message: 'Initialization failed' })
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
