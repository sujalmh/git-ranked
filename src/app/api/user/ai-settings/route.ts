import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getAiModel, RECOMMENDED_AI_MODELS } from '@/lib/ai/openrouter';
import {
  AI_PROVIDERS,
  MODELS_BY_PROVIDER,
  normalizeEndpoint,
  type AiProvider,
} from '@/lib/ai/models';

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
      SELECT openrouter_api_key, ai_model, use_custom_key, ai_endpoint, ai_provider
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
        aiProvider: 'openrouter' as AiProvider,
        aiEndpoint: '',
        providers: AI_PROVIDERS,
        modelsByProvider: MODELS_BY_PROVIDER,
        presets: RECOMMENDED_AI_MODELS,
      });
    }

    const user = rows[0];
    const keyStr = typeof user.openrouter_api_key === 'string' ? user.openrouter_api_key.trim() : '';
    const userModel = typeof user.ai_model === 'string' ? user.ai_model.trim() : '';
    const userEndpoint = typeof user.ai_endpoint === 'string' ? user.ai_endpoint.trim() : '';
    const userProvider = (user.ai_provider as AiProvider) || 'openrouter';

    return NextResponse.json({
      useCustomKey: Boolean(user.use_custom_key),
      hasCustomKeySet: Boolean(keyStr),
      apiKeyMasked: maskApiKey(keyStr),
      aiModel: userModel || defaultModel,
      defaultModel,
      aiProvider: userProvider,
      aiEndpoint: userEndpoint,
      providers: AI_PROVIDERS,
      modelsByProvider: MODELS_BY_PROVIDER,
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
    const { apiKey, aiModel, aiProvider, aiEndpoint } = body;

    const existingRows = await sql`
      SELECT openrouter_api_key, ai_model, use_custom_key, ai_endpoint, ai_provider
      FROM app_users
      WHERE id = ${userId}
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentKey = existingRows[0].openrouter_api_key;
    const currentModel = existingRows[0].ai_model;
    const currentEndpoint = existingRows[0].ai_endpoint;
    const currentProvider = (existingRows[0].ai_provider as AiProvider) || 'openrouter';

    const newModel = typeof aiModel === 'string' ? aiModel.trim() : currentModel;

    const knownProviders = AI_PROVIDERS.map((p) => p.id);
    const newProvider: AiProvider =
      typeof aiProvider === 'string' && (knownProviders as string[]).includes(aiProvider)
        ? (aiProvider as AiProvider)
        : currentProvider;

    // Endpoint handling: custom providers require an explicit OpenAI-compatible
    // URL; known providers use their preset by default (empty = default).
    let newEndpoint = currentEndpoint;
    if (newProvider === 'custom') {
      const raw = typeof aiEndpoint === 'string' ? aiEndpoint.trim() : '';
      if (!raw) {
        return NextResponse.json({ error: 'The custom provider requires an endpoint URL.' }, { status: 400 });
      }
      newEndpoint = normalizeEndpoint(raw, 'custom');
    } else if (typeof aiEndpoint === 'string') {
      const raw = aiEndpoint.trim();
      newEndpoint = raw ? normalizeEndpoint(raw, newProvider) : '';
    }

    if (newProvider === 'custom' && !newModel) {
      return NextResponse.json({ error: 'The custom provider requires a model id.' }, { status: 400 });
    }

    let newKey = currentKey;
    if (typeof apiKey === 'string') {
      const trimmedKey = apiKey.trim();
      // An empty value clears the key; a masked value (contains "...") means the
      // user left the existing key untouched — keep it.
      if (trimmedKey === '' || !trimmedKey.includes('...')) {
        newKey = trimmedKey;
      }
    }

    const hasKeySet = Boolean(typeof newKey === 'string' && newKey.trim());
    if (!hasKeySet && (newModel !== currentModel || newProvider !== currentProvider)) {
      return NextResponse.json(
        { error: 'An API key is required to change your AI provider or model.' },
        { status: 400 }
      );
    }

    // A personal AI config is active exactly when a key is set.
    const newUseCustom = hasKeySet;

    await sql`
      UPDATE app_users
      SET use_custom_key = ${newUseCustom},
          openrouter_api_key = ${newKey},
          ai_model = ${newModel},
          ai_endpoint = ${newEndpoint},
          ai_provider = ${newProvider}
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
        aiProvider: newProvider,
        aiEndpoint: typeof newEndpoint === 'string' ? newEndpoint : '',
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
