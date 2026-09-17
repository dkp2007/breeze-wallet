export interface FraudConfig {
  flagThreshold: number
  blockThreshold: number
  largeTransferCents: number
  velocityLimit: number
  velocityWindowMinutes: number
  dailyVolumeCents: number
  newRecipientAgeDays: number
  oddHoursStart: number
  oddHoursEnd: number
}

export interface TransferRiskContext {
  amountCents: number
  recipientAgeDays: number | null
  transfersLastWindow: number
  dailyOutflowCents: number
  now: Date
}

export interface RuleHit {
  rule: string
  points: number
  message: string
}

export type Decision = 'allow' | 'flag' | 'block'

export interface RiskAssessment {
  score: number
  decision: Decision
  hits: RuleHit[]
}

export function assessTransferRisk(ctx: TransferRiskContext, cfg: FraudConfig): RiskAssessment {
  const hits: RuleHit[] = []

  if (ctx.amountCents >= cfg.largeTransferCents) {
    hits.push({
      rule: 'large_transfer',
      points: 20,
      message: 'The amount you are sending is above our usual limit'
    })
  }

  if (ctx.recipientAgeDays !== null && ctx.recipientAgeDays < cfg.newRecipientAgeDays) {
    hits.push({
      rule: 'new_recipient',
      points: 20,
      message: 'The person you are sending to created their wallet less than a week ago'
    })
  }

  if (ctx.transfersLastWindow >= cfg.velocityLimit) {
    hits.push({
      rule: 'transfer_velocity',
      points: 40,
      message: `You have sent ${cfg.velocityLimit} transfers in the last ${cfg.velocityWindowMinutes} minutes`
    })
  }

  const hour = ctx.now.getUTCHours()
  if (hour >= cfg.oddHoursStart && hour < cfg.oddHoursEnd) {
    hits.push({
      rule: 'odd_hours',
      points: 10,
      message: 'This transfer was attempted at an unusual time of day'
    })
  }

  if (ctx.dailyOutflowCents + ctx.amountCents > cfg.dailyVolumeCents) {
    hits.push({
      rule: 'daily_volume',
      points: 25,
      message: 'This transfer would take your daily sending above our usual limit'
    })
  }

  return decide(hits, cfg)
}

export interface LoginRiskContext {
  isNewDevice: boolean
  hasOtherDevices: boolean
}

export function assessLoginRisk(ctx: LoginRiskContext): RiskAssessment | null {
  if (!ctx.isNewDevice || !ctx.hasOtherDevices) {
    return null
  }
  return {
    score: 60,
    decision: 'flag',
    hits: [
      {
        rule: 'new_device_login',
        points: 60,
        message: 'Sign-in from a device we have not seen for this wallet before'
      }
    ]
  }
}

function decide(hits: RuleHit[], cfg: FraudConfig): RiskAssessment {
  const score = hits.reduce((sum, hit) => sum + hit.points, 0)
  const decision: Decision = score >= cfg.blockThreshold ? 'block' : score >= cfg.flagThreshold ? 'flag' : 'allow'
  return { score, decision, hits }
}