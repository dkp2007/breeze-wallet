import { describe, expect, it } from 'vitest'
import { assessLoginRisk, assessTransferRisk } from '../src/services/fraud.js'
import type { FraudConfig } from '../src/services/fraud.js'

const cfg: FraudConfig = {
  flagThreshold: 40,
  blockThreshold: 60,
  largeTransferCents: 100000,
  velocityLimit: 5,
  velocityWindowMinutes: 10,
  dailyVolumeCents: 200000,
  newRecipientAgeDays: 7,
  oddHoursStart: 1,
  oddHoursEnd: 5
}

function ctx(overrides: Partial<Parameters<typeof assessTransferRisk>[0]> = {}) {
  return {
    amountCents: 5000,
    recipientAgeDays: 100,
    transfersLastWindow: 0,
    dailyOutflowCents: 0,
    now: new Date('2026-09-06T12:00:00Z'),
    ...overrides
  }
}

describe('assessTransferRisk', () => {
  it('allows a small ordinary transfer', () => {
    const result = assessTransferRisk(ctx(), cfg)
    expect(result.decision).toBe('allow')
    expect(result.score).toBe(0)
    expect(result.hits).toHaveLength(0)
  })

  it('flags a large transfer to a brand new recipient', () => {
    const result = assessTransferRisk(ctx({ amountCents: 120000, recipientAgeDays: 1 }), cfg)
    expect(result.decision).toBe('flag')
    expect(result.score).toBe(40)
    expect(result.hits.map((h) => h.rule).sort()).toEqual(['large_transfer', 'new_recipient'])
  })

  it('flags a transfer burst above the velocity limit', () => {
    const result = assessTransferRisk(ctx({ transfersLastWindow: 5 }), cfg)
    expect(result.decision).toBe('flag')
    expect(result.hits[0].rule).toBe('transfer_velocity')
  })

  it('blocks a large transfer during a burst', () => {
    const result = assessTransferRisk(ctx({ amountCents: 150000, transfersLastWindow: 5 }), cfg)
    expect(result.decision).toBe('block')
    expect(result.score).toBe(60)
  })

  it('flags a large transfer that breaches the daily outflow limit', () => {
    const result = assessTransferRisk(ctx({ amountCents: 100000, dailyOutflowCents: 190000, transfersLastWindow: 1 }), cfg)
    expect(result.decision).toBe('flag')
    expect(result.score).toBe(45)
    expect(result.hits.map((h) => h.rule)).toContain('daily_volume')
  })

  it('scores odd hours but allows it alone', () => {
    const result = assessTransferRisk(ctx({ now: new Date('2026-09-06T03:00:00Z') }), cfg)
    expect(result.decision).toBe('allow')
    expect(result.score).toBe(10)
  })

  it('flags odd hours combined with a daily volume breach', () => {
    const result = assessTransferRisk(
      ctx({ now: new Date('2026-09-06T03:00:00Z'), amountCents: 100000, dailyOutflowCents: 190000 }),
      cfg
    )
    expect(result.decision).toBe('flag')
    expect(result.score).toBe(55)
  })
})

describe('assessLoginRisk', () => {
  it('flags a sign-in from a new device when other devices exist', () => {
    const result = assessLoginRisk({ isNewDevice: true, hasOtherDevices: true })
    expect(result?.decision).toBe('flag')
    expect(result?.hits[0].rule).toBe('new_device_login')
  })

  it('returns null for the first ever sign-in', () => {
    expect(assessLoginRisk({ isNewDevice: true, hasOtherDevices: false })).toBeNull()
  })

  it('returns null for a known device', () => {
    expect(assessLoginRisk({ isNewDevice: false, hasOtherDevices: true })).toBeNull()
  })
})