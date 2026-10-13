import { createHmac } from 'node:crypto';
import { signPayload, verifySignature } from './webhook-signature';

describe('подпись вебхука (HMAC-SHA256)', () => {
  const secret = 'test-webhook-secret';
  const body = JSON.stringify({
    eventId: 'evt_1',
    paymentId: '00000000-0000-4000-8000-000000000000',
    status: 'succeeded',
    amount: 25000,
  });

  it('signPayload считает HMAC-SHA256 в hex', () => {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    expect(signPayload(body, secret)).toBe(expected);
    expect(signPayload(body, secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('строка и Buffer с одинаковыми байтами дают одинаковую подпись', () => {
    expect(signPayload(Buffer.from(body), secret)).toBe(
      signPayload(body, secret),
    );
  });

  it('принимает корректную подпись', () => {
    expect(verifySignature(body, signPayload(body, secret), secret)).toBe(true);
  });

  it('отклоняет подпись другим секретом', () => {
    const forged = signPayload(body, 'other-secret');
    expect(verifySignature(body, forged, secret)).toBe(false);
  });

  it('отклоняет подпись, если тело изменили хотя бы на символ', () => {
    const signature = signPayload(body, secret);
    const tampered = body.replace('25000', '1');
    expect(verifySignature(tampered, signature, secret)).toBe(false);
  });

  it('отклоняет пустую, обрезанную и не-hex подпись', () => {
    const signature = signPayload(body, secret);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, '', secret)).toBe(false);
    expect(verifySignature(body, signature.slice(0, 10), secret)).toBe(false);
    expect(verifySignature(body, 'z'.repeat(64), secret)).toBe(false);
  });
});
