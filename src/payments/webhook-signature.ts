import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подпись вебхука: HMAC-SHA256 от СЫРОГО тела запроса с общим секретом,
 * в виде hex-строки. Провайдер считает её у себя и кладёт в заголовок X-Signature,
 * мы считаем у себя и сравниваем. Не зная секрета, подделать подпись нельзя.
 */
export function signPayload(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifySignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signPayload(rawBody, secret), 'hex');
  const received = Buffer.from(signature, 'hex');
  // timingSafeEqual сравнивает за одинаковое время независимо от того, где первое
  // расхождение, — по времени ответа нельзя подбирать подпись побайтово.
  // Он требует буферы одной длины, поэтому длину проверяем отдельно.
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
