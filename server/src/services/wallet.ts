import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { config } from '../config.js'
import { AppError, FraudBlockedError, InsufficientFundsError, LimitExceededError, NotFoundError } from '../lib/errors.js'
import { currencyMoney as money } from '../lib/http.js'
import { checkLimits } from '../lib/limits.js'
import { assertSupportedCurrency, convertCents } from '../lib/currencies.js'
import { assessLoginRisk, assessTransferRisk } from './fraud.js'
import type { RiskAssessment } from './fraud.js'
import type { TransactionRow, TransactionStatus, TransactionType, WalletRow } from '../types.js'

export async function getWallet(userId: string): Promise<WalletRow | null> {
  const { rows } = await pool.query('select user_id, balance, currency, per_transaction_limit, daily_limit from wallets where user_id = $1', [userId])
  if (rows.length === 0) {
    return null
  }
  return {
    ...rows[0],
    balance: Number(rows[0].balance),
    per_transaction_limit: rows[0].per_transaction_limit === null ? null : Number(rows[0].per_transaction_limit),
    daily_limit: rows[0].daily_limit === null ? null : Number(rows[0].daily_limit)
  }
}

export async function getLimits(userId: string): Promise<{ perTransactionLimit: number | null; dailyLimit: number | null }> {
  const { rows } = await pool.query('select per_transaction_limit, daily_limit from wallets where user_id = $1', [userId])
  return {
    perTransactionLimit: rows[0]?.per_transaction_limit === null || rows[0]?.per_transaction_limit === undefined ? null : Number(rows[0].per_transaction_limit),
    dailyLimit: rows[0]?.daily_limit === null || rows[0]?.daily_limit === undefined ? null : Number(rows[0].daily_limit)
  }
}

export async function setLimits(
  userId: string,
  limits: { perTransactionLimit: number | null; dailyLimit: number | null }
): Promise<{ perTransactionLimit: number | null; dailyLimit: number | null }> {
  const { rows } = await pool.query(
    'update wallets set per_transaction_limit = $2, daily_limit = $3, updated_at = now() where user_id = $1 returning per_transaction_limit, daily_limit',
    [userId, limits.perTransactionLimit, limits.dailyLimit]
  )
  if (rows.length === 0) {
    throw new NotFoundError('No wallet found for this account')
  }
  return {
    perTransactionLimit: rows[0].per_transaction_limit === null ? null : Number(rows[0].per_transaction_limit),
    dailyLimit: rows[0].daily_limit === null ? null : Number(rows[0].daily_limit)
  }
}

async function assertWithinLimits(
  userId: string,
  amountCents: number,
  kind: 'transfer' | 'withdrawal'
): Promise<void> {
  const walletCurrency = await getWalletCurrency(userId)
  const limits = await getLimits(userId)
  const hasAnyLimit = limits.perTransactionLimit !== null || limits.dailyLimit !== null
  if (!hasAnyLimit) return

  const dailyOutflowCents = await dailyOutflow(userId, kind)
  const violation = checkLimits(amountCents, { ...limits, dailyOutflowCents })
  if (violation) {
    throw new LimitExceededError({ ...violation, currency: walletCurrency })
  }
}

async function dailyOutflow(userId: string, kind: 'transfer' | 'withdrawal'): Promise<number> {
  const currency = await getWalletCurrency(userId)
  if (kind === 'transfer') {
    const { rows } = await pool.query(
      `select currency, coalesce(sum(amount), 0)::bigint as total from transactions
       where user_id = $1 and type = 'transfer_out' and status in ('completed', 'flagged')
         and created_at > now() - interval '24 hours'
       group by currency`,
      [userId]
    )
    return await sumAsCurrency(rows, currency)
  }
  const { rows } = await pool.query(
    `select currency, coalesce(sum(amount), 0)::bigint as total from transactions
     where user_id = $1 and type = 'withdrawal' and status in ('completed', 'pending')
       and created_at > now() - interval '24 hours'
     group by currency`,
    [userId]
  )
  return await sumAsCurrency(rows, currency)
}

async function sumAsCurrency(rows: { currency: string; total: string | number }[], targetCurrency: string): Promise<number> {
  let total = 0
  for (const row of rows) {
    const cents = Number(row.total)
    total += row.currency === targetCurrency ? cents : await convertCents(cents, row.currency, targetCurrency)
  }
  return total
}

export async function listTransactions(
  userId: string,
  filters: { type?: string; status?: string; limit?: number; offset?: number } = {}
): Promise<{ rows: TransactionRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  const clauses = ['user_id = $1']
  const params: unknown[] = [userId]

  if (filters.type) {
    params.push(filters.type)
    clauses.push(`type = $${params.length}`)
  }
  if (filters.status) {
    params.push(filters.status)
    clauses.push(`status = $${params.length}`)
  }

  const where = clauses.join(' and ')
  params.push(limit, offset)

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`select * from transactions where ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params),
    pool.query(`select count(*)::int as total from transactions where ${where}`, params.slice(0, -2))
  ])

  return { rows: rows.map(mapTransaction), total: countRows[0].total }
}

export async function getWalletCurrency(userId: string): Promise<string> {
  const { rows } = await pool.query('select currency from wallets where user_id = $1', [userId])
  return rows[0]?.currency ?? 'inr'
}

export async function setWalletCurrency(userId: string, currency: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query('select balance from wallets where user_id = $1 for update', [userId])
    if (rows.length === 0) {
      throw new NotFoundError('No wallet found for this account')
    }
    if (Number(rows[0].balance) !== 0) {
      throw new AppError(400, 'Your wallet still has money in it. Send, withdraw, or spend it all before switching currency.')
    }
    const pending = await client.query("select 1 from transactions where user_id = $1 and type = 'withdrawal' and status = 'pending' limit 1", [userId])
    if (pending.rowCount && pending.rowCount > 0) {
      throw new AppError(400, 'You have a withdrawal on the way. Wait for it to finish before switching currency.')
    }
    await client.query('update wallets set currency = $2, updated_at = now() where user_id = $1', [userId, currency])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function createTransfer(
  senderId: string,
  input: { recipientEmail: string; amountCents: number }
): Promise<{
  transaction: TransactionRow
  recipient: { id: string; email: string }
  assessment: RiskAssessment
  currency: string
  debitCents: number
  creditCents: number
  recipientCurrency: string
}> {
  const { recipientEmail, amountCents } = input
  await assertWithinLimits(senderId, amountCents, 'transfer')

  const [senderResult, recipientResult] = await Promise.all([
    pool.query('select email from profiles where id = $1', [senderId]),
    pool.query('select id, email, created_at from profiles where lower(email) = lower($1)', [recipientEmail])
  ])
  if (recipientResult.rows.length === 0) {
    throw new NotFoundError('No wallet found for that email')
  }
  const senderEmail = senderResult.rows[0]?.email ?? senderId
  const recipient = recipientResult.rows[0]
  if (recipient.id === senderId) {
    throw new AppError(400, 'You cannot send money to yourself')
  }

  const senderCurrency = await getWalletCurrency(senderId)
  const recipientCurrency = await getWalletCurrency(recipient.id)
  const creditCents = senderCurrency === recipientCurrency ? amountCents : await convertCents(amountCents, senderCurrency, recipientCurrency)

  const now = new Date()
  const [velocityResult, dailyResult] = await Promise.all([
    pool.query(
      `select count(*)::int as n from transactions
       where user_id = $1 and type = 'transfer_out' and status <> 'blocked'
         and created_at > now() - make_interval(mins => $2)`,
      [senderId, config.fraud.velocityWindowMinutes]
    ),
    pool.query(
      `select coalesce(sum(amount), 0)::bigint as total from transactions
       where user_id = $1 and type = 'transfer_out' and status in ('completed', 'flagged')
         and created_at > now() - interval '24 hours'`,
      [senderId]
    )
  ])

  const recipientAgeDays = (now.getTime() - new Date(recipient.created_at).getTime()) / 86_400_000
  const assessment = assessTransferRisk(
    {
      amountCents,
      recipientAgeDays,
      transfersLastWindow: velocityResult.rows[0].n,
      dailyOutflowCents: Number(dailyResult.rows[0].total),
      now
    },
    config.fraud
  )

  if (assessment.decision === 'block') {
    await insertAlert(senderId, 'transfer_blocked', 'critical', `We stopped a transfer of ${money(amountCents, senderCurrency)} to ${recipientEmail} for your safety`, {
      amountCents,
      recipientEmail,
      hits: assessment.hits
    })
    await insertTransaction(senderId, 'transfer_out', amountCents, 'blocked', recipientEmail, `blocked_${randomUUID()}`, {
      risk: assessment
    })
    throw new FraudBlockedError(assessment.hits)
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    const senderResult = await client.query('select balance from wallets where user_id = $1 for update', [senderId])
    if (senderResult.rows.length === 0 || Number(senderResult.rows[0].balance) < amountCents) {
      throw new InsufficientFundsError()
    }

    await client.query('update wallets set balance = balance - $2, updated_at = now() where user_id = $1', [senderId, amountCents])
    await client.query('update wallets set balance = balance + $2, updated_at = now() where user_id = $1', [recipient.id, creditCents])

    const status: TransactionStatus = assessment.decision === 'flag' ? 'flagged' : 'completed'
    const reference = `transfer_${randomUUID()}`
    const senderTx = await client.query(
      `insert into transactions (user_id, type, amount, currency, status, counterparty, reference, metadata)
       values ($1, 'transfer_out', $2, $3, $4, $5, $6, $7) returning *`,
      [senderId, amountCents, senderCurrency, status, recipient.email, reference, { risk: assessment, creditAmount: creditCents, creditCurrency: recipientCurrency }]
    )
    await client.query(
      `insert into transactions (user_id, type, amount, currency, status, counterparty, reference, metadata)
       values ($1, 'transfer_in', $2, $3, $4, $5, $6, $7)`,
      [recipient.id, creditCents, recipientCurrency, status, senderEmail, reference, { risk: assessment, debitAmount: amountCents, debitCurrency: senderCurrency }]
    )

    await client.query('commit')

    if (assessment.decision === 'flag') {
      await insertAlert(senderId, 'transfer_flagged', 'high', `${money(amountCents, senderCurrency)} sent to ${recipient.email} is being looked at`, {
        amountCents,
        recipientEmail: recipient.email,
        hits: assessment.hits
      })
    }

    return { transaction: mapTransaction(senderTx.rows[0]), recipient: { id: recipient.id, email: recipient.email }, assessment, currency: senderCurrency, debitCents: amountCents, creditCents, recipientCurrency }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function creditWallet(
  userId: string,
  amountCents: number,
  type: 'deposit' | 'refund',
  counterparty: string,
  reference: string,
  metadata: Record<string, unknown> = {},
  currency?: string
): Promise<TransactionRow> {
  const walletCurrency = currency ?? (await getWalletCurrency(userId))
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('update wallets set balance = balance + $2, updated_at = now() where user_id = $1', [userId, amountCents])
    const { rows } = await client.query(
      `insert into transactions (user_id, type, amount, currency, status, counterparty, reference, metadata)
       values ($1, $2, $3, $4, 'completed', $5, $6, $7) returning *`,
      [userId, type, amountCents, walletCurrency, counterparty, reference, metadata]
    )
    await client.query('commit')
    return mapTransaction(rows[0])
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function debitForWithdrawal(userId: string, amountCents: number, reference: string): Promise<TransactionRow> {
  await assertWithinLimits(userId, amountCents, 'withdrawal')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const senderResult = await client.query('select balance from wallets where user_id = $1 for update', [userId])
    if (senderResult.rows.length === 0 || Number(senderResult.rows[0].balance) < amountCents) {
      throw new InsufficientFundsError()
    }
    await client.query('update wallets set balance = balance - $2, updated_at = now() where user_id = $1', [userId, amountCents])
    const withdrawalCurrency = await getWalletCurrency(userId)
    const { rows } = await client.query(
      `insert into transactions (user_id, type, amount, currency, status, counterparty, reference)
       values ($1, 'withdrawal', $2, $3, 'pending', 'bank transfer', $4) returning *`,
      [userId, amountCents, withdrawalCurrency, reference]
    )
    await client.query('commit')
    return mapTransaction(rows[0])
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function markWithdrawalPaid(transactionId: string): Promise<void> {
  await pool.query("update transactions set status = 'completed' where id = $1 and type = 'withdrawal'", [transactionId])
}

export async function refundWithdrawal(transactionId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query("select user_id, amount, currency from transactions where id = $1 and type = 'withdrawal' and status = 'pending' for update", [transactionId])
    if (rows.length === 0) {
      await client.query('commit')
      return
    }
    await client.query("update transactions set status = 'failed' where id = $1", [transactionId])
    await client.query('update wallets set balance = balance + $2, updated_at = now() where user_id = $1', [rows[0].user_id, Number(rows[0].amount)])
    await client.query(
      `insert into transactions (user_id, type, amount, currency, status, counterparty, reference, metadata)
       values ($1, 'refund', $2, $3, 'completed', 'bank transfer', $4, $5)`,
      [rows[0].user_id, Number(rows[0].amount), rows[0].currency, `refund_${transactionId}`, { refunds: transactionId }]
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function recordLogin(userId: string, ip: string, userAgent: string): Promise<RiskAssessment | null> {
  const recent = await pool.query(
    'select 1 from login_events where user_id = $1 and ip = $2 and user_agent = $3 and created_at > now() - interval \'24 hours\' limit 1',
    [userId, ip, userAgent]
  )
  const isNewDevice = recent.rowCount === 0

  const distinct = await pool.query('select count(distinct (ip, user_agent))::int as n from login_events where user_id = $1', [userId])
  const hasOtherDevices = distinct.rows[0].n >= 1

  await pool.query('insert into login_events (user_id, ip, user_agent) values ($1, $2, $3)', [userId, ip, userAgent])

  const assessment = assessLoginRisk({ isNewDevice, hasOtherDevices })
  if (assessment) {
    await insertAlert(userId, 'new_device_login', 'high', 'Sign-in from a device we have not seen for this wallet before', { ip, userAgent })
  }
  return assessment
}

export async function listAlerts(userId: string): Promise<{ alerts: unknown[]; unread: number }> {
  const [{ rows }, { rows: unreadRows }] = await Promise.all([
    pool.query('select * from alerts where user_id = $1 order by created_at desc limit 50', [userId]),
    pool.query('select count(*)::int as n from alerts where user_id = $1 and read = false', [userId])
  ])
  return { alerts: rows, unread: unreadRows[0].n }
}

export async function markAlertRead(userId: string, alertId: string): Promise<void> {
  await pool.query('update alerts set read = true where id = $1 and user_id = $2', [alertId, userId])
}

async function insertAlert(userId: string, type: string, severity: string, message: string, payload: Record<string, unknown>): Promise<void> {
  await pool.query('insert into alerts (user_id, type, severity, message, payload) values ($1, $2, $3, $4, $5)', [
    userId,
    type,
    severity,
    message,
    JSON.stringify(payload)
  ])
}

async function insertTransaction(
  userId: string,
  type: TransactionType,
  amount: number,
  status: TransactionStatus,
  counterparty: string,
  reference: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `insert into transactions (user_id, type, amount, status, counterparty, reference, metadata)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, amount, status, counterparty, reference, JSON.stringify(metadata)]
  )
}

function mapTransaction(row: Record<string, unknown>): TransactionRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    type: row.type as TransactionType,
    amount: Number(row.amount),
    status: row.status as TransactionStatus,
    counterparty: row.counterparty ? String(row.counterparty) : null,
    reference: row.reference ? String(row.reference) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    currency: row.currency ? String(row.currency) : 'inr',
    created_at: String(row.created_at)
  }
}