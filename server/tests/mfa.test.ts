import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasVerifiedFactor,
  needsSecondFactor,
  parseTokenClaims,
  tokenHasSecondFactor
} from '../src/lib/mfa.js'
import { AppError, MfaRequiredError } from '../src/lib/errors.js'

vi.mock('../src/db.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
      admin: { mfa: { listFactors: vi.fn() } }
    }
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [1] })
  }
}))

import { supabaseAdmin } from '../src/db.js'
import { requireAuth } from '../src/middleware/auth.js'
import type { User } from '@supabase/supabase-js'

const getUserMock = supabaseAdmin.auth.getUser as ReturnType<typeof vi.fn>
const listFactorsMock = supabaseAdmin.auth.admin.mfa.listFactors as ReturnType<typeof vi.fn>

function makeToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `header.${payload}.signature`
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}): User {
  return {
    id: 'user-1',
    email: 'demo@wallet.local',
    ...overrides
  } as unknown as User
}

function runMiddleware(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as never
  const err: unknown = undefined
  const next = vi.fn()
  return requireAuth(req, {} as never, next).then(() => ({ next }))
}

describe('parseTokenClaims', () => {
  it('decodes the middle segment of a JWT', () => {
    const claims = parseTokenClaims(makeToken({ aal: 'aal1' }))
    expect(claims?.aal).toBe('aal1')
  })

  it('returns null for a token with no payload segment', () => {
    expect(parseTokenClaims('not-a-jwt')).toBeNull()
  })

  it('returns null for a token whose payload is not JSON', () => {
    expect(parseTokenClaims('header.%%%signature')).toBeNull()
  })
})

describe('tokenHasSecondFactor', () => {
  it('accepts aal2', () => {
    expect(tokenHasSecondFactor({ aal: 'aal2' })).toBe(true)
  })

  it('accepts an mfa/totp method in the amr list', () => {
    expect(tokenHasSecondFactor({ aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }, { method: 'mfa/totp', timestamp: 2 }] })).toBe(true)
  })

  it('rejects a password-only token', () => {
    expect(tokenHasSecondFactor({ aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }] })).toBe(false)
  })

  it('rejects missing claims', () => {
    expect(tokenHasSecondFactor(null)).toBe(false)
  })
})

describe('hasVerifiedFactor', () => {
  it('accepts a verified totp factor', () => {
    expect(hasVerifiedFactor([{ status: 'verified', factor_type: 'totp' }])).toBe(true)
  })

  it('ignores unverified and non-totp factors', () => {
    expect(hasVerifiedFactor([{ status: 'unverified', factor_type: 'totp' }])).toBe(false)
    expect(hasVerifiedFactor([{ status: 'verified', factor_type: 'phone' }])).toBe(false)
    expect(hasVerifiedFactor([])).toBe(false)
    expect(hasVerifiedFactor(null)).toBe(false)
  })
})

describe('needsSecondFactor', () => {
  it('demands the second factor when the wallet has one but the token does not', () => {
    const token = makeToken({ aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }] })
    expect(needsSecondFactor(token, [{ status: 'verified', factor_type: 'totp' }])).toBe(true)
  })

  it('passes a password-only token when the wallet has no second factor', () => {
    const token = makeToken({ aal: 'aal1' })
    expect(needsSecondFactor(token, [])).toBe(false)
    expect(needsSecondFactor(token, null)).toBe(false)
  })

  it('passes a token that already carries the second factor', () => {
    const token = makeToken({ aal: 'aal2', amr: [{ method: 'mfa/totp', timestamp: 2 }] })
    expect(needsSecondFactor(token, [{ status: 'verified', factor_type: 'totp' }])).toBe(false)
  })

  it('treats an unreadable token as missing the second factor', () => {
    expect(needsSecondFactor('garbage.token', [{ status: 'verified', factor_type: 'totp' }])).toBe(true)
  })
})

describe('MfaRequiredError', () => {
  it('carries status 403 and the mfa_required code', () => {
    const err = new MfaRequiredError()
    expect(err.status).toBe(403)
    expect(err.code).toBe('mfa_required')
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('requireAuth middleware', () => {
  beforeEach(() => {
    getUserMock.mockReset()
    listFactorsMock.mockReset()
    listFactorsMock.mockResolvedValue({ data: { factors: [] }, error: null })
  })

  it('accepts a password-only token when the wallet has no second factor', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser() }, error: null })
    const token = makeToken({ aal: 'aal1', session_id: 'session-1' })
    const { next } = await runMiddleware(token)
    expect(next).toHaveBeenCalledWith()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects a password-only token when a verified code exists on the wallet', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser() }, error: null })
    listFactorsMock.mockResolvedValue({
      data: { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] },
      error: null
    })
    const token = makeToken({ aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }], session_id: 'session-1' })
    const { next } = await runMiddleware(token)
    const err = next.mock.calls[0]?.[0] as AppError
    expect(err).toBeInstanceOf(MfaRequiredError)
    expect(err.status).toBe(403)
    expect(err.code).toBe('mfa_required')
  })

  it('skips the factor lookup when the token already carries the second factor', async () => {
    getUserMock.mockResolvedValue({ data: { user: makeUser() }, error: null })
    const token = makeToken({ aal: 'aal2', amr: [{ method: 'mfa/totp', timestamp: 2 }], session_id: 'session-1' })
    const { next } = await runMiddleware(token)
    expect(next).toHaveBeenCalledWith()
    expect(listFactorsMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid token with a plain session error', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const { next } = await runMiddleware(makeToken({ aal: 'aal1', session_id: 'session-1' }))
    const err = next.mock.calls[0]?.[0] as AppError
    expect(err).toBeInstanceOf(AppError)
    expect(err.status).toBe(401)
  })
})
