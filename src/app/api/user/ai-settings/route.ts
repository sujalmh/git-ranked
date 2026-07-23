import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getAiModel, RECOMMENDED_AI_MODELS } from '@/lib/ai/openrouter';

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = Number(session.user.id);
    const rows = await sql`
      SELECT openrouter_api_key, ai_model, use_custom_key
      FROM app_users
      WHERE id = ${userId}
    `;

    const defaultModel = await getAiModel();

    if (rows.length === 0) {
      return NextResponse.json({
        useCustomKey: false,
        hasCustomKeySet: false,
        apiKeyMasked: '',
        aiModel: defaultModel,
        defaultModel,
        presets: RECOMMENDED_AI_MODELS,
      });
    }

    const user = rows[0];
    const keyStr = typeof user.openrouter_api_key === 'string' ? user.openrouter_api_key.trim() : '';
    const userModel = typeof user.ai_model === 'string' ? user.ai_model.trim() : '';

    return NextResponse.json({
      useCustomKey: Boolean(user.use_custom_key),
      hasCustomKeySet: Boolean(keyStr),
      apiKeyMasked: maskApiKey(keyStr),
      aiModel: userModel || defaultModel,
      defaultModel,
      presets: RECOMMENDED_AI_MODELS,
    });
  } catch (error) {
    console.error('Failed to get user AI settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = Number(session.user.id);
    const body = await req.json();
    const { useCustomKey, openrouterApiKey, aiModel } = body;

    const existingRows = await sql`
      SELECT openrouter_api_key, ai_model, use_custom_key
      FROM app_users
      WHERE id = ${userId}
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentKey = existingRows[0].openrouter_api_key;
    const currentModel = existingRows[0].ai_model;
    const currentUseCustom = Boolean(existingRows[0].use_custom_key);

    const newUseCustom = typeof useCustomKey === 'boolean' ? useCustomKey : currentUseCustom;
    const newModel = typeof aiModel === 'string' ? aiModel.trim() : currentModel;

    let newKey = currentKey;
    if (typeof openrouterApiKey === 'string') {
      const trimmedKey = openrouterApiKey.trim();
      // If user provides empty string or non-masked string, update it
      if (trimmedKey === '' || !trimmedKey.includes('...')) {
        newKey = trimmedKey;
      }
    }

    const hasKeySet = Boolean(typeof newKey === 'string' && newKey.trim());
    if (newModel !== currentModel && (!newUseCustom || !hasKeySet)) {
      return NextResponse.json(
        { error: 'An OpenRouter API key must be set and enabled to change your AI model preference.' },
        { status: 400 }
      );
    }

    await sql`
      UPDATE app_users
      SET use_custom_key = ${newUseCustom},
          openrouter_api_key = ${newKey},
          ai_model = ${newModel}
      WHERE id = ${userId}
    `;

    const defaultModel = await getAiModel();
    const finalKeyStr = typeof newKey === 'string' ? newKey.trim() : '';

    return NextResponse.json({
      success: true,
      settings: {
        useCustomKey: newUseCustom,
        hasCustomKeySet: Boolean(finalKeyStr),
        apiKeyMasked: maskApiKey(finalKeyStr),
        aiModel: newModel || defaultModel,
        defaultModel,
      },
    });
  } catch (error) {
    console.error('Failed to update user AI settings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update AI settings' },
      { status: 500 }
    );
  }
}
