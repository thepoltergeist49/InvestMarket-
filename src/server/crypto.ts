import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'investmarket-dev-session-secret-change-in-prod';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

export function signWebhookPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = signWebhookPayload(payload, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateNumericCode(digits = 6): string {
  const max = Math.pow(10, digits);
  const min = Math.pow(10, digits - 1);
  return String(crypto.randomInt(min, max));
}

export function formatRef(prefix: string, seq: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}
