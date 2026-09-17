export type TransactionType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'refund'
export type TransactionStatus = 'pending' | 'completed' | 'flagged' | 'failed' | 'blocked'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type RiskDecision = 'allow' | 'flag' | 'block'

export interface RuleHit {
  rule: string
  points: number
  message: string
}

export interface RiskAssessment {
  score: number
  decision: RiskDecision
  hits: RuleHit[]
}

export interface Wallet {
  user_id: string
  balance: number
  currency: string
  per_transaction_limit: number | null
  daily_limit: number | null
}

export interface Transaction {
  id: string
  user_id: string
  type: TransactionType
  amount: number
  currency: string
  status: TransactionStatus
  counterparty: string | null
  reference: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Alert {
  id: string
  user_id: string
  type: string
  severity: AlertSeverity
  message: string
  payload: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface ProfileDetails {
  fullName: string
  phone: string
  city: string
  bio: string
  avatarUrl: string
}

export interface CurrencyOption {
  code: string
  symbol: string
  locale: string
}

export interface MePayload {
  user: { id: string; email: string; fullName?: string }
  profileDetails: ProfileDetails | null
  wallet: Wallet | null
  loginRisk: RiskAssessment | null
  availableCurrencies?: CurrencyOption[]
}

export interface WalletPayload {
  wallet: Wallet | null
  recent: Transaction[]
}

export interface TransferResult {
  transaction: Transaction
  recipient: { id: string; email: string }
  assessment: RiskAssessment
  currency?: string
  debitCents?: number
  creditCents?: number
  recipientCurrency?: string
}

export interface AlertsPayload {
  alerts: Alert[]
  unread: number
}

export interface TrendPoint {
  day: string
  inflow: number
  outflow: number
  transactions: number
}

export interface BreakdownPoint {
  type: TransactionType
  count: number
  volume: number
}

export interface FraudRuleStat {
  type: string
  hits: number
  lastHit: string
}

export interface AnalyticsOverview {
  currency?: string
  balance: number
  transactionCount: number
  totalIn: number
  totalOut: number
  alertCount: number
  unreadAlerts: number
}
