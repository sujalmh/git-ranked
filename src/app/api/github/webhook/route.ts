import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleWebhookEvent } from '@/lib/webhook-handlers';

export async function POST(req: Request) {
  const payloadText = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const eventName = req.headers.get('x-github-event');
  const eventId = req.headers.get('x-github-delivery');

  if (!signature || !eventName || !eventId) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Verify signature
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(payloadText);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  if (signature !== expectedSignature) {
    console.error('Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (e) {
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
