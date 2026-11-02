import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { cashfreeBaseUrl, makeOrderId, verifyCashfreeWebhook } from './cashfree';
import type { VercelRequest } from '@vercel/node';

afterEach(() => {
  delete process.env.CASHFREE_ENVIRONMENT;
  delete process.env.CASHFREE_CLIENT_SECRET;
});

describe('Cashfree sandbox safeguards', () => {
  it('refuses non-sandbox environment', () => {
    process.env.CASHFREE_ENVIRONMENT = 'production';
    expect(() => cashfreeBaseUrl()).toThrow('Only Cashfree Sandbox is enabled');
  });

  it('creates provider-safe unique order identifiers', () => {
    const first = makeOrderId('auction / 123');
    const second = makeOrderId('auction / 123');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^60s_auction123_/);
  });

  it('validates webhook HMAC over timestamp and exact raw body', () => {
    const timestamp = '1760000000';
    const raw = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK"}');
    const secret = 'sandbox-secret';
    process.env.CASHFREE_CLIENT_SECRET = secret;
    const signature = createHmac('sha256', secret).update(timestamp + raw.toString('utf8')).digest('base64');
    const req = {
      headers: { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp },
    } as unknown as VercelRequest;
    expect(verifyCashfreeWebhook(req, raw)).toBe(true);
    expect(verifyCashfreeWebhook(req, Buffer.from(raw.toString() + ' '))).toBe(false);
  });
});
