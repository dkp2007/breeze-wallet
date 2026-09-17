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

const signIn = async () => {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@wallet.local', password: 'demo1234' })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('sign-in failed')
  return data.access_token
}

const call = (token, method, path, body) =>
  fetch(`${api}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const token = await signIn()

const initial = await call(token, 'GET', '/bank')
check('bank status responds', initial.status === 200 && typeof initial.body.linked === 'boolean', JSON.stringify(initial.body))

const withdrawalBlocked = await call(token, 'POST', '/withdrawals', { amount: '1.00' })
check(
  'withdrawal refused while bank is not linked',
  withdrawalBlocked.status === 400 && withdrawalBlocked.body.code === 'bank_not_linked',
  withdrawalBlocked.body.error ?? ''
)

const link = await call(token, 'POST', '/bank/link')
if (link.status === 502 && /access key/.test(String(link.body.error))) {
  console.log('BLOCKED STRIPE_API_KEY is invalid — fix STRIPE_SECRET_KEY in server/.env, then rerun to test the full flow')
} else {
  const url = link.body.url
  check('onboarding link created', link.status === 200 && typeof url === 'string' && url.includes('stripe.com'), String(url).slice(0, 90))

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.STRIPE_SECRET_KEY)
  const account = url.match(/acct_[A-Za-z0-9]+/)?.[0]
  check('account id extracted from link', !!account, account)

  await stripe.accounts.update(account, {
    business_type: 'individual',
    individual: {
      first_name: 'Demo',
      last_name: 'User',
      email: 'demo@wallet.local',
      dob: { day: 1, month: 1, year: 1990 }
    },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' }
  })

  const external = await stripe.accounts.createExternalAccount(account, {
    external_account: 'btok_developer_bank',
    default_for_currency: true
  })
  check('test bank attached', !!external.id, external.id)

  const updated = await stripe.accounts.retrieve(account)
  check('payouts enabled', updated.payouts_enabled === true, `details_submitted=${updated.details_submitted}`)

  const status = await call(token, 'GET', '/bank')
  check('status reflects payouts enabled', status.body.linked === true && status.body.payoutsEnabled === true, JSON.stringify(status.body))

  const attempt = await call(token, 'POST', '/withdrawals', { amount: '1.00' })
  console.log(`INFO withdrawal with linked bank → ${attempt.status} ${JSON.stringify(attempt.body).slice(0, 160)}`)

  await call(token, 'POST', '/bank/unlink', { confirm: true })
  const reset = await call(token, 'GET', '/bank')
  check('unlink restores unlinked state', reset.body.linked === false && reset.body.payoutsEnabled === false)
}

console.log('done')
