import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAiModel, setAiModel, RECOMMENDED_AI_MODELS } from '@/lib/ai/openrouter';
import { isAdminGithubId } from '@/lib/admin';

export async function GET() {
  try {
    const currentModel = await getAiModel();
    return NextResponse.json({
      currentModel,
      presets: RECOMMENDED_AI_MODELS,
    });
  } catch (error) {
    console.error('Failed to get AI model:', error);
    return NextResponse.json({ error: 'Failed to fetch AI model' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const userGithubId = session?.user?.githubId;

  if (!userGithubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isAdminGithubId(userGithubId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { model } = body;

    if (!model || typeof model !== 'string' || !model.trim()) {
      return NextResponse.json({ error: 'Invalid model parameter' }, { status: 400 });
    }

    const updated = await setAiModel(model.trim());
    return NextResponse.json({
      success: true,
      model: updated,
      message: `AI model updated to ${updated}`,
    });
  } catch (error) {
    console.error('Failed to update AI model:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update AI model' },
      { status: 500 }
    );
  }
}
