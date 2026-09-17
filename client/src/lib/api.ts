import { supabase } from './supabase'
import type {
  AlertsPayload,
  AnalyticsOverview,
  BreakdownPoint,
  FraudRuleStat,
  MePayload,
  Transaction,
  TransactionType,
  TransactionStatus,
  TransferResult,
  TrendPoint,
  WalletPayload
} from './types'

const baseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    let code: string | undefined
    try {
      const body = (await res.json()) as { error?: string; code?: string }
      if (body.error) {
        message = body.error
      }
      code = body.code
    } catch {
    }
    throw new ApiError(res.status, message, code)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export interface TransactionQuery {
  type?: TransactionType | ''
  status?: TransactionStatus | ''
  limit?: number
  offset?: number
}

export const newRequestId = (): string => crypto.randomUUID()

export interface FxPayload {
  base: 'usd'
  rates: Record<string, number>
  source: 'live' | 'fallback'
  fetchedAt: string
}

export const api = {
  me: () => request<MePayload>('/me'),
  updateProfile: (fields: { fullName?: string; phone?: string; city?: string; bio?: string; avatarUrl?: string | null }) =>
    request<{ wallet: WalletPayload['wallet'] }>('/me', {
      method: 'PATCH',
      body: JSON.stringify(fields)
  }),
  updateLimits: (limits: { perTransaction: number | null; daily: number | null }) =>
    request<{ wallet: WalletPayload['wallet'] }>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ limits })
  }),
  wallet: () => request<WalletPayload>('/wallet'),

  transactions: (query: TransactionQuery = {}) => {
    const q = new URLSearchParams()
    if (query.type) q.set('type', query.type)
    if (query.status) q.set('status', query.status)
    q.set('limit', String(query.limit ?? 50))
    q.set('offset', String(query.offset ?? 0))
    return request<{ rows: Transaction[]; total: number }>(`/transactions?${q.toString()}`)
  },

  createTransfer: (recipientEmail: string, amount: string, idempotencyKey: string) =>
    request<TransferResult>('/transfers', { method: 'POST', body: JSON.stringify({ recipientEmail, amount }) }, idempotencyKey),

  createDeposit: (amount: string, idempotencyKey: string) =>
    request<{ url: string }>('/deposits', { method: 'POST', body: JSON.stringify({ amount }) }, idempotencyKey),

  createWithdrawal: (amount: string, idempotencyKey: string) =>
    request<{ withdrawal: Transaction }>('/withdrawals', { method: 'POST', body: JSON.stringify({ amount }) }, idempotencyKey),

  closeAccount: (password: string) =>
    request<{ ok: boolean }>('/me', { method: 'DELETE', body: JSON.stringify({ password }) }),

  bankStatus: () => request<{ linked: boolean; payoutsEnabled: boolean }>('/bank'),
  linkBank: () => request<{ url: string | null; alreadyLinked?: boolean }>('/bank/link', { method: 'POST' }),
  unlinkBank: () => request<{ ok: boolean }>('/bank/unlink', { method: 'POST', body: JSON.stringify({ confirm: true }) }),

  alerts: () => request<AlertsPayload>('/alerts'),
  markAlertRead: (id: string) => request<{ ok: boolean }>(`/alerts/${id}/read`, { method: 'PATCH' }),

  sessions: () =>
    request<{
      currentSessionId: string
      sessions: {
        sessionId: string
        deviceName: string
        deviceType: string
        browser: string | null
        os: string | null
        ip: string | null
        createdAt: string
        lastSeenAt: string
        isCurrent: boolean
      }[]
    }>('/sessions'),
  revokeSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}`, { method: 'DELETE' }),
  signOutEverywhere: () => request<{ ok: boolean; revokedCount: number }>('/sessions/sign-out-everywhere', { method: 'POST' }),

  downloadStatement: async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch(`${baseUrl}/transactions/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) {
      throw new ApiError(res.status, 'Could not download your statement')
    }
    return res
  },

  analyticsOverview: () => request<AnalyticsOverview>('/analytics/overview'),
  analyticsTrends: (days = 30) => request<{ days: number; points: TrendPoint[] }>(`/analytics/trends?days=${days}`),
  analyticsBreakdown: () => request<{ points: BreakdownPoint[] }>('/analytics/breakdown'),
  analyticsFraud: (days = 30) => request<{ days: number; rules: FraudRuleStat[] }>(`/analytics/fraud?days=${days}`),

  fx: () => request<FxPayload>('/fx'),
  setCurrency: (currency: string) =>
    request<{ wallet: WalletPayload['wallet'] }>('/me', {
      method: 'PATCH',
      body: JSON.stringify({ currency })
    })
}
