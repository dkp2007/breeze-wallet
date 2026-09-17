import { pool } from '../db.js'
import { getWalletCurrency } from './wallet.js'
import { convertCents } from '../lib/currencies.js'

const MONEY_STATUSES = "'completed', 'flagged'"

async function sumAs(rows: { currency: string; value: string | number }[], currency: string): Promise<number> {
  let total = 0
  for (const row of rows) {
    const cents = Number(row.value)
    total += row.currency === currency ? cents : await convertCents(cents, row.currency, currency)
  }
  return total
}

export async function overview(userId: string) {
  const currency = await getWalletCurrency(userId)
  const { rows } = await pool.query(
    `select
       (select currency from wallets where user_id = $1) as wallet_currency,
       (select balance from wallets where user_id = $1) as balance,
       (select count(*)::int from transactions where user_id = $1) as transaction_count,
       (select count(*)::int from alerts where user_id = $1) as alert_count,
       (select count(*)::int from alerts where user_id = $1 and read = false) as unread_alerts`,
    [userId]
  )
  const inRows = await pool.query(
    `select currency, coalesce(sum(amount), 0)::bigint as value from transactions
     where user_id = $1 and status in (${MONEY_STATUSES}) and type in ('deposit', 'transfer_in', 'refund')
     group by currency`,
    [userId]
  )
  const outRows = await pool.query(
    `select currency, coalesce(sum(amount), 0)::bigint as value from transactions
     where user_id = $1 and status in (${MONEY_STATUSES}) and type in ('withdrawal', 'transfer_out')
     group by currency`,
    [userId]
  )
  const row = rows[0]
  return {
    currency: row.wallet_currency ?? currency,
    balance: Number(row.balance ?? 0),
    transactionCount: row.transaction_count,
    totalIn: await sumAs(inRows.rows, currency),
    totalOut: await sumAs(outRows.rows, currency),
    alertCount: row.alert_count,
    unreadAlerts: row.unread_alerts
  }
}

export async function trends(userId: string, days: number) {
  const window = Math.min(Math.max(days ?? 30, 1), 365)
  const currency = await getWalletCurrency(userId)
  const { rows } = await pool.query(
    `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, currency,
            coalesce(sum(case when type in ('deposit', 'transfer_in', 'refund') then amount else 0 end), 0)::bigint as inflow,
            coalesce(sum(case when type in ('withdrawal', 'transfer_out') then amount else 0 end), 0)::bigint as outflow,
            count(*)::int as transactions
     from transactions
     where user_id = $1 and status in (${MONEY_STATUSES}) and created_at > now() - make_interval(days => $2)
     group by date_trunc('day', created_at), currency
     order by day`,
    [userId, window]
  )

  const byDay = new Map<string, { inflow: number; outflow: number; transactions: number }>()
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { inflow: 0, outflow: 0, transactions: 0 }
    const target = row.currency === currency ? null : currency
    if (target) {
      entry.inflow += await convertCents(Number(row.inflow), row.currency, currency)
      entry.outflow += await convertCents(Number(row.outflow), row.currency, currency)
    } else {
      entry.inflow += Number(row.inflow)
      entry.outflow += Number(row.outflow)
    }
    entry.transactions += row.transactions
    byDay.set(row.day, entry)
  }

  return Array.from(byDay.entries())
    .map(([day, entry]) => ({ day, inflow: entry.inflow, outflow: entry.outflow, transactions: entry.transactions }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

export async function breakdown(userId: string) {
  const currency = await getWalletCurrency(userId)
  const { rows } = await pool.query(
    `select type, currency, count(*)::int as count, coalesce(sum(amount), 0)::bigint as value
     from transactions
     where user_id = $1 and status in (${MONEY_STATUSES})
     group by type, currency`,
    [userId]
  )

  const byType = new Map<string, { count: number; volume: number }>()
  for (const row of rows) {
    const entry = byType.get(row.type) ?? { count: 0, volume: 0 }
    const cents = row.currency === currency ? Number(row.value) : await convertCents(Number(row.value), row.currency, currency)
    entry.count += row.count
    entry.volume += cents
    byType.set(row.type, entry)
  }

  return Array.from(byType.entries())
    .map(([type, entry]) => ({ type, count: entry.count, volume: entry.volume, currency }))
    .sort((a, b) => b.volume - a.volume)
}

export async function fraudHits(userId: string, days: number) {
  const window = Math.min(Math.max(days ?? 30, 1), 365)
  const { rows } = await pool.query(
    `select type, count(*)::int as hits, max(created_at) as last_hit
     from alerts
     where user_id = $1 and created_at > now() - make_interval(days => $2)
     group by type
     order by hits desc`,
    [userId, window]
  )
  return rows.map((row) => ({ type: row.type, hits: row.hits, lastHit: String(row.last_hit) }))
}
