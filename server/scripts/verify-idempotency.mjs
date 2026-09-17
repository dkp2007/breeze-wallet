import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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
  return (await res.json()).access_token
}

const token = await signIn()
const call = (method, path, body, key) =>
  fetch(`${api}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(key ? { 'Idempotency-Key': key } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const key = randomUUID()
const send = () => call('POST', '/transfers', { recipientEmail: 'friend@wallet.local', amount: '1.00' }, key)

const results = await Promise.all([send(), send(), send(), send(), send()])
const okResults = results.filter((r) => r.status === 200)
const conflictResults = results.filter((r) => r.status === 409)
const otherResults = results.filter((r) => r.status !== 200 && r.status !== 409)

console.log('responses:', results.map((r) => r.status).join(', '))
check('at least one request succeeded', okResults.length >= 1)
check('no unexpected errors', otherResults.length === 0, JSON.stringify(otherResults.map((r) => r.body)).slice(0, 120))

const references = new Set(okResults.map((r) => r.body.transaction?.reference))
check('every success has the same reference', references.size === 1, [...references].join(', '))

const reference = [...references][0]
if (reference) {
  const retry = await send()
  check(
    'retry after completion replays the original response',
    retry.status === 200 && retry.body.transaction?.reference === reference,
    `status=${retry.status} reference=${retry.body.transaction?.reference}`
  )

  const changed = await call('POST', '/transfers', { recipientEmail: 'friend@wallet.local', amount: '99.00' }, key)
  check(
    'same key with a different amount still replays the original',
    changed.status === 200 && changed.body.transaction?.reference === reference,
    `amount shows ${changed.body.transaction?.amount}`
  )

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const { rows } = await client.query('select count(*)::int as n from transactions where reference = $1 and type = $2', [
    reference,
    'transfer_out'
  ])
  await client.end()
  check('exactly one transfer exists in the ledger', rows[0].n === 1, `count=${rows[0].n}`)
}

const differentKey = await call('POST', '/transfers', { recipientEmail: 'friend@wallet.local', amount: '1.00' }, randomUUID())
check('a fresh key is a fresh transfer', differentKey.status === 200 && differentKey.body.transaction?.reference !== reference)

if (differentKey.status === 200 && okResults[0]) {
  const friendToken = await (async () => {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'friend@wallet.local', password: 'demo1234' })
    })
    return (await res.json()).access_token
  })()
  await fetch(`${api}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${friendToken}` },
    body: JSON.stringify({ recipientEmail: 'demo@wallet.local', amount: '2.00' })
  })
  console.log('cleanup: ₹2.00 returned to the demo wallet')
}

console.log('done')
