import { NextResponse } from 'next/server';
import crypto, { timingSafeEqual } from 'crypto';
import { handleWebhookEvent } from '@/lib/webhook-handlers';

function getWebhookSecrets() {
  return [
    process.env.GITHUB_WEBHOOK_SECRET,
    ...(process.env.GITHUB_WEBHOOK_SECRETS?.split(',') ?? []),
  ]
    .map(secret => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
}

function createSignature(payloadText: string, webhookSecret: string) {
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(payloadText);

  return `sha256=${hmac.digest('hex')}`;
}

function signaturesMatch(signature: string, expectedSignature: string) {
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  return (
    signatureBuffer.length === expectedSignatureBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  );
}

export async function POST(req: Request) {
  const payloadText = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const eventName = req.headers.get('x-github-event');
  const eventId = req.headers.get('x-github-delivery');

  if (!signature || !eventName || !eventId) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
  }

  const webhookSecrets = getWebhookSecrets();
  if (webhookSecrets.length === 0) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const verified = webhookSecrets.some(webhookSecret =>
    signaturesMatch(signature, createSignature(payloadText, webhookSecret))
  );

  if (!verified) {
    console.error('Invalid GitHub webhook signature', { eventName, eventId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    await handleWebhookEvent(eventName, payload, eventId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook handler failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
