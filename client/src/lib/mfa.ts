export interface MfaFactorLike {
  factor_type: string
  status: string
}

function tokenAal(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { aal?: string }
    return claims.aal ?? null
  } catch {
    return null
  }
}

export function tokenHasSecondFactor(token: string | null | undefined): boolean {
  return tokenAal(token) === 'aal2'
}
