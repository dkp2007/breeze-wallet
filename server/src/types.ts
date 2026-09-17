export type TransactionType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'refund'
export type TransactionStatus = 'pending' | 'completed' | 'flagged' | 'failed' | 'blocked'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface TransactionRow {
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

export interface WalletRow {
  user_id: string
  balance: number
  currency: string
  per_transaction_limit: number | null
  daily_limit: number | null
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        email: string
      }
    }
  }
}

export {}