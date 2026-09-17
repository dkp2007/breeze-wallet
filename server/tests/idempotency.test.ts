import { beforeEach, beforeAll, describe, expect, it } from 'vitest'
import { checkLimits } from '../src/lib/limits.js'

const { claimKey, storeResponse } = await import('../src/lib/idempotency.js')
const { pool } = await import('../src/db.js')

const uniqueKey = () => `test-${crypto.randomUUID()}`

let userId = ''
let otherUserId = ''

beforeAll(async () => {
  const { rows } = await pool.query("select id from profiles where email = 'demo@wallet.local'")
  userId = rows[0].id
  const { rows: other } = await pool.query("select id from profiles where email = 'friend@wallet.local'")
  otherUserId = other[0].id
})

describe('claimKey', () => {
  beforeEach(async () => {
    await pool.query('delete from idempotency_keys where user_id = $1', [userId])
  })

  it('claims a fresh key', async () => {
    const result = await claimKey(userId, uniqueKey(), 'transfers')
    expect(result).toBe('claimed')
  })

  it('replays when the same key is reused after a stored response', async () => {
    const key = uniqueKey()
    expect(await claimKey(userId, key, 'transfers')).toBe('claimed')
    await storeResponse(userId, key, 200, { ok: true })
    expect(await claimKey(userId, key, 'transfers')).toBe('replay')
  })

  it('refuses a key reused on a different endpoint', async () => {
    const key = uniqueKey()
    expect(await claimKey(userId, key, 'transfers')).toBe('claimed')
    await storeResponse(userId, key, 200, { ok: true })
    await expect(claimKey(userId, key, 'withdrawals')).rejects.toMatchObject({ status: 409 })
  })

  it('reports in-flight while no response is stored', async () => {
    const key = uniqueKey()
    expect(await claimKey(userId, key, 'transfers')).toBe('claimed')
    await expect(claimKey(userId, key, 'transfers')).rejects.toMatchObject({ status: 409 })
  })

  it('scopes keys per user', async () => {
    const key = uniqueKey()
    expect(await claimKey(userId, key, 'transfers')).toBe('claimed')
    expect(await claimKey(otherUserId, key, 'transfers')).toBe('claimed')
    await pool.query('delete from idempotency_keys where user_id = $1', [otherUserId])
  })
})

describe('checkLimits regression', () => {
  it('still blocks above the per-transaction limit', () => {
    expect(checkLimits(6_00, { perTransactionLimit: 5_00, dailyLimit: null, dailyOutflowCents: 0 })?.kind).toBe('per_transaction')
  })
})
