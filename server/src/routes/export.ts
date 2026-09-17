import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { pool } from '../db.js'
import { CURRENCIES } from '../lib/currencies.js'

const router = Router()

function csvCell(value: string | number | null | undefined): string {
  let raw = value === null || value === undefined ? '' : String(value)
  if (/^[=+@\t\r-]/.test(raw)) {
    raw = `'${raw}`
  }
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function csvType(type: string): string {
  const map: Record<string, string> = {
    deposit: 'Top-up',
    withdrawal: 'Withdrawal',
    transfer_in: 'Money received',
    transfer_out: 'Money sent',
    refund: 'Refund'
  }
  return map[type] ?? type
}

function csvStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'On its way',
    completed: 'Completed',
    flagged: 'Being looked at',
    failed: 'Failed',
    blocked: 'Stopped for your safety'
  }
  return map[status] ?? status
}

router.get(
  '/transactions/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `select type, amount, currency, status, counterparty, reference, created_at
       from transactions where user_id = $1 order by created_at asc`,
      [req.user!.userId]
    )

    const header = ['Date', 'Description', 'Reference', 'Status', 'Amount', 'Currency']
    const lines = [header.map(csvCell).join(',')]

    for (const row of rows) {
      const currency = String(row.currency ?? 'inr').toLowerCase()
      const symbol = CURRENCIES[currency]?.symbol ?? ''
      const amount = `${symbol}${(Number(row.amount) / 100).toFixed(2)}`
      const when = new Date(row.created_at).toISOString()
      lines.push(
        [
          csvCell(when),
          csvCell(csvType(row.type)),
          csvCell(row.reference ?? ''),
          csvCell(csvStatus(row.status)),
          csvCell(amount),
          csvCell(currency.toUpperCase())
        ].join(',')
      )
    }

    const from = rows[0] ? new Date(rows[0].created_at).toISOString().slice(0, 10) : 'all'
    const to = new Date().toISOString().slice(0, 10)
    const filename = `statement_${from}_${to}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(`\ufeff${lines.join('\r\n')}`)
  })
)

export default router
