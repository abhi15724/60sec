import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { cashfreeBaseUrl, makeOrderId, verifyCashfreeWebhook } from './cashfree';
import type { VercelRequest } from '@vercel/node';

afterEach(() => {
  delete process.env.CASHFREE_ENVIRONMENT;
  delete process.env.CASHFREE_CLIENT_SECRET;
  delete process.env.PAYMENTS_LIVE_ENABLED;
});

describe('Cashfree environment safeguards', () => {
  it('defaults to Sandbox', () => {
    delete process.env.CASHFREE_ENVIRONMENT;
    expect(cashfreeBaseUrl()).toBe('https://sandbox.cashfree.com/pg');
  });

  it('requires an explicit live-payment kill-switch opt-in', () => {
    process.env.CASHFREE_ENVIRONMENT = 'production';
    delete process.env.PAYMENTS_LIVE_ENABLED;
    expect(() => cashfreeBaseUrl()).toThrow('Live Cashfree payments are disabled');
  });

  it('uses production endpoint only after explicit opt-in', () => {
    process.env.CASHFREE_ENVIRONMENT = 'production';
    process.env.PAYMENTS_LIVE_ENABLED = 'true';
    expect(cashfreeBaseUrl()).toBe('https://api.cashfree.com/pg');
  });

  it('rejects unknown environments', () => {
    process.env.CASHFREE_ENVIRONMENT = 'prod';
    expect(() => cashfreeBaseUrl()).toThrow('must be sandbox or production');
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
