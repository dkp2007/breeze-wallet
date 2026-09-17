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
  if (!data.access_token) throw new Error('sign-in failed: ' + JSON.stringify(data).slice(0, 200))
  return data.access_token
}

const call = (token, method, path, body) =>
  fetch(`${api}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const token = await signIn()

const setLimits = (perTransaction, daily) => call(token, 'PATCH', '/me', { limits: { perTransaction, daily } })
const wallet = async () => (await call(token, 'GET', '/me')).body.wallet
const send = (amount) => call(token, 'POST', '/transfers', { recipientEmail: 'friend@wallet.local', amount })

const { rows } = (await call(token, 'GET', '/transactions?type=transfer_out&limit=100')).body
const cutoff = Date.now() - 24 * 60 * 60 * 1000
const outflow24h = rows
  .filter((t) => (t.status === 'completed' || t.status === 'flagged') && new Date(t.created_at).getTime() > cutoff)
  .reduce((sum, t) => sum + t.amount, 0)

await setLimits(null, null)

const perTx = 500
const daily = outflow24h + 1100
check('set limits ₹5 / rolling daily', (await setLimits(perTx, daily)).status === 200)
const w = await wallet()
check('wallet reports limits', w?.per_transaction_limit === perTx && w?.daily_limit === daily, JSON.stringify(w))

const over = await send('10.00')
check('per-transfer block', over.status === 400 && over.body.code === 'limit_exceeded', over.body.error ?? '')

const first = await send('4.00')
const second = await send('4.00')
check('under-limit transfers pass', first.status === 200 && second.status === 200)

const third = await send('4.00')
check('daily block', third.status === 400 && third.body.code === 'limit_exceeded', third.body.error ?? '')

const cleared = await setLimits(null, null)
const wAfter = await wallet()
check('removing limits clears them', cleared.status === 200 && wAfter?.per_transaction_limit === null && wAfter?.daily_limit === null)

if (first.status === 200 && second.status === 200) {
  const friendToken = await (async () => {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'friend@wallet.local', password: 'demo1234' })
    })
    return (await res.json()).access_token
  })()
  const back = await call(friendToken, 'POST', '/transfers', { recipientEmail: 'demo@wallet.local', amount: '8.00' })
  check('money returned so demo state is restored', back.status === 200, back.body.error ?? '')
}

console.log('done')
