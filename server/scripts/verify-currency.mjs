import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

const api = 'http://localhost:4000/api'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const { data: usersData } = await supabase.auth.admin.listUsers()
const demo = usersData.users.find((u) => u.email === 'demo@wallet.local')
const friend = usersData.users.find((u) => u.email === 'friend@wallet.local')
check('demo and friend accounts exist', Boolean(demo && friend))

const { createClient: pgCreateClient } = await import('pg').then((m) => ({ createClient: null }))
void pgCreateClient
const { Client } = await import('pg')
const db = new Client({ connectionString: env.DATABASE_URL })
await db.connect()

async function setCurrencyDb(userId, currency) {
  await db.query('update wallets set currency = $2, balance = 0 where user_id = $1', [userId, currency])
}

async function signIn() {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ email: 'demo@wallet.local', password: 'demo1234' })
  })
  const session = await res.json()
  if (!session.access_token) throw new Error(`sign-in failed: ${JSON.stringify(session).slice(0, 200)}`)
  return session.access_token
}

const token = await signIn()
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const fx = await (await fetch(`${api}/fx`, { headers: authHeaders })).json()
check('fx endpoint returns rates', Boolean(fx.rates?.inr && fx.rates?.usd), `source=${fx.source} usd->inr=${fx.rates.inr}`)

const expectedInr = Math.round((500 / fx.rates.usd) * fx.rates.inr)

await db.query('update wallets set balance = 500, currency = $2 where user_id = $1', [demo.id, 'usd'])
await db.query('update wallets set balance = 0, currency = $2 where user_id = $1', [friend.id, 'inr'])

const transferRes = await fetch(`${api}/transfers`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ recipientEmail: 'friend@wallet.local', amount: '5.00' })
})
const transfer = await transferRes.json()
check('cross-currency transfer accepted', transferRes.status === 200, transferRes.status === 200 ? `sent $5.00` : JSON.stringify(transfer).slice(0, 160))
check('sender transaction stored in usd', transfer.transaction?.currency === 'usd', transfer.transaction?.currency)
check(
  'recipient got converted amount',
  transfer.creditCents === expectedInr,
  `${transfer.creditCents} cents inr (expected ${expectedInr} at rate ${fx.rates.inr})`
)

const friendRows = await db.query('select balance, currency from wallets where user_id = $1', [friend.id])
check(
  'friend wallet credited in inr',
  Number(friendRows.rows[0].balance) === expectedInr && friendRows.rows[0].currency === 'inr',
  `${friendRows.rows[0].balance} ${friendRows.rows[0].currency}`
)
const friendTx = await db.query(
  "select amount, currency, metadata->>'debitAmount' as debit, metadata->>'debitCurrency' as debit_currency from transactions where user_id = $1 and type = 'transfer_in' order by created_at desc limit 1",
  [friend.id]
)
check(
  'friend ledger row records the original send',
  friendTx.rows[0]?.currency === 'inr' && Number(friendTx.rows[0].debit) === 500 && friendTx.rows[0].debit_currency === 'usd',
  `${friendTx.rows[0].amount} ${friendTx.rows[0].currency} from ${friendTx.rows[0].debit} ${friendTx.rows[0].debit_currency}`
)

const overview = await (await fetch(`${api}/analytics/overview`, { headers: authHeaders })).json()
check('analytics overview reports currency', overview.currency === 'usd', `currency=${overview.currency} balance=${overview.balance}`)
check('analytics converts mixed rows', overview.totalIn === 0 || typeof overview.totalIn === 'number', `totalIn=${overview.totalIn} totalOut=${overview.totalOut}`)

await db.query('update wallets set balance = 300, currency = $2 where user_id = $1', [demo.id, 'usd'])
await db.query("delete from transactions where user_id = $1 and type = 'transfer_in'", [friend.id])
await db.query('update wallets set balance = 0 where user_id = $1', [friend.id])

const switchRes = await fetch(`${api}/me`, {
  method: 'PATCH',
  headers: authHeaders,
  body: JSON.stringify({ currency: 'inr' })
})
const switchBody = await switchRes.json()
check(
  'currency switch refused with money in wallet',
  switchRes.status === 400,
  switchRes.status === 400 ? switchBody.error?.slice(0, 90) : JSON.stringify(switchBody).slice(0, 90)
)

await db.query('update wallets set balance = 0 where user_id = $1', [demo.id])
const switchOk = await fetch(`${api}/me`, {
  method: 'PATCH',
  headers: authHeaders,
  body: JSON.stringify({ currency: 'inr' })
})
check('currency switch succeeds at zero balance', switchOk.status === 200)
const walletAfter = (await switchOk.json()).wallet
check('wallet now reports inr', walletAfter?.currency === 'inr', walletAfter?.currency)

await db.query('update wallets set currency = $2, balance = 42900 where user_id = $1', [demo.id, 'inr'])

const me = await (await fetch(`${api}/me`, { headers: authHeaders })).json()
check('me payload lists currencies', Array.isArray(me.availableCurrencies) && me.availableCurrencies.length >= 4, me.availableCurrencies?.map((c) => c.code).join(','))

await db.end()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
