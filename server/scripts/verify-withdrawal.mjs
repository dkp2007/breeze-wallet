import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

const api = 'http://localhost:4000/api'
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const Stripe = (await import('stripe')).default
const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const { Client } = await import('pg')
const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const sign = async (email) => {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' })
  })
  return (await res.json()).access_token
}
const token = await sign('demo@wallet.local')

const account = await stripe.accounts.create({
  type: 'custom',
  email: 'demo@wallet.local',
  capabilities: { transfers: { requested: true } },
  business_type: 'individual',
  business_profile: { url: 'https://wallet.example' },
  individual: {
    first_name: 'Demo',
    last_name: 'User',
    email: 'demo@wallet.local',
    dob: { day: 1, month: 1, year: 1990 }
  },
  tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' }
})
await stripe.accounts.createExternalAccount(account.id, {
  external_account: 'btok_us',
  default_for_currency: true
})
const fresh = await stripe.accounts.retrieve(account.id)
check(
  'fresh test account fully onboarded with transfers',
  fresh.payouts_enabled === true && fresh.details_submitted === true && fresh.capabilities.transfers === 'active',
  `payouts=${fresh.payouts_enabled} details=${fresh.details_submitted} transfers=${fresh.capabilities.transfers}`
)

await c.query('update profiles set stripe_account_id = $2, payouts_enabled = true where email = $1', [
  'demo@wallet.local',
  account.id
])

const status = await fetch(`${api}/bank`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
check('status reports linked and enabled', status.linked === true && status.payoutsEnabled === true, JSON.stringify(status))

const before = await c.query('select balance from wallets w join profiles p on p.id = w.user_id where p.email = $1', [
  'demo@wallet.local'
])
console.log('wallet balance before:', before.rows[0].balance)

const w = await fetch(`${api}/withdrawals`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: '1.00' })
})
const wBody = await w.json()
check('withdrawal accepted', w.status === 200, JSON.stringify(wBody).slice(0, 200))

const transfers = await stripe.transfers.list({ destination: account.id, limit: 5 })
const t = transfers.data.find((x) => x.metadata?.transactionId === wBody.withdrawal?.id)
check(
  'transfer reached the user account',
  !!t && t.amount === 100,
  t ? `${t.id} ${t.amount} ${t.currency}` : 'none'
)

const payouts = await stripe.payouts.list({ stripeAccount: account.id, limit: 5 })
const p = payouts.data.find((x) => x.metadata?.transactionId === wBody.withdrawal?.id)
check(
  'payout to the user bank triggered',
  !!p && p.amount === 100,
  p ? `${p.id} ${p.amount} ${p.currency} status=${p.status}` : 'none'
)

const after = await c.query('select balance from wallets w join profiles p on p.id = w.user_id where p.email = $1', [
  'demo@wallet.local'
])
check(
  'wallet debited once',
  Number(after.rows[0].balance) === Number(before.rows[0].balance) - 100,
  `${before.rows[0].balance} → ${after.rows[0].balance}`
)

await c.query('update profiles set stripe_account_id = null, payouts_enabled = false where email = $1', [
  'demo@wallet.local'
])
await stripe.accounts.del(account.id).catch(() => {})
console.log('cleanup: demo profile unlinked, fresh test account deleted')
await c.end()
console.log('done')
