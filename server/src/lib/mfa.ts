export interface TokenClaims {
  aal?: string
  amr?: { method: string; timestamp: number }[]
  session_id?: string
  jti?: string
}

export interface MfaFactorLike {
  status: string
  factor_type: string
}

export function parseTokenClaims(token: string): TokenClaims | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(decoded) as TokenClaims
  } catch {
    return null
  }
}

export function tokenHasSecondFactor(claims: TokenClaims | null): boolean {
  if (!claims) return false
  if (claims.aal === 'aal2') return true
  return (claims.amr ?? []).some((entry) => entry.method === 'mfa/totp')
}

export function hasVerifiedFactor(factors: MfaFactorLike[] | null | undefined): boolean {
  return (factors ?? []).some((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
}

export function needsSecondFactor(token: string, factors: MfaFactorLike[] | null | undefined): boolean {
  return hasVerifiedFactor(factors) && !tokenHasSecondFactor(parseTokenClaims(token))
}
