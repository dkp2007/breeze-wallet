import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const { Client } = await import('pg')
const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const demo = await c.query("select id from profiles where email = 'demo@wallet.local'")
const userId = demo.rows[0].id

const recent = await c.query(
  "select id, status, amount, counterparty, created_at from transactions where user_id = $1 and type = 'withdrawal' order by created_at desc limit 6",
  [userId]
)
console.log('recent withdrawals:')
for (const row of recent.rows) console.log(' ', row.id, row.status, row.amount, row.created_at)

const testRow = recent.rows.find((r) => r.status === 'pending' && Number(r.amount) === 100 && r.counterparty === 'bank transfer')
if (testRow) {
  await c.query('delete from transactions where id = $1', [testRow.id])
  await c.query('update wallets set balance = balance + 100 where user_id = $1', [userId])
  console.log('cleanup: removed test withdrawal row, restored 100 cents')
}

const balance = await c.query('select balance from wallets where user_id = $1', [userId])
console.log('final demo balance:', balance.rows[0].balance)
await c.end()
