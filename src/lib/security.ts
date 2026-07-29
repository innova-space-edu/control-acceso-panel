import { createHash, randomBytes } from 'crypto'

export function hashDeviceToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createDeviceToken() {
  return randomBytes(32).toString('base64url')
}

export function getRequestIp(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return headers.get('x-real-ip') || null
}
