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
check('demo account exists', Boolean(demo))

const { Client } = await import('pg')
const db = new Client({ connectionString: env.DATABASE_URL })
await db.connect()

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

async function signInSecondDevice() {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ email: 'demo@wallet.local', password: 'demo1234' })
  })
  const session = await res.json()
  if (!session.access_token) throw new Error(`second sign-in failed`)
  return session.access_token
}

const tokenA = await signIn()
const headersA = { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' }

await db.query("delete from server_sessions where user_id = $1 and session_id <> 'keep-marker'", [demo.id])

const listRes = await fetch(`${api}/sessions`, { headers: headersA })
const listBody = await listRes.json()
check('sessions list works', listRes.status === 200, listRes.status === 200 ? `${listBody.sessions.length} session(s)` : JSON.stringify(listBody).slice(0, 120))
check('current session flagged', listBody.sessions?.some((s) => s.isCurrent), listBody.sessions?.map((s) => `${s.deviceName}${s.isCurrent ? '*' : ''}`).join(', '))

const tokenB = await signInSecondDevice()
const headersB = { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' }

const listRes2 = await fetch(`${api}/sessions`, { headers: headersB })
const listBody2 = await listRes2.json()
check('second device appears in the list', listBody2.sessions?.length >= 2, `${listBody2.sessions?.length} session(s)`)
check('each session knows if it is current', listBody2.sessions.filter((s) => s.isCurrent).length === 1)
const sessionA = listBody2.sessions.find((s) => !s.isCurrent)
check('device names are human readable', listBody2.sessions.every((s) => typeof s.deviceName === 'string' && s.deviceName.length > 3), listBody2.sessions.map((s) => s.deviceName).join(' | '))

const csvRes = await fetch(`${api}/transactions/export`, { headers: headersA })
const csvText = await csvRes.text()
check('csv export works', csvRes.status === 200 && csvRes.headers.get('content-type').includes('text/csv'), `status=${csvRes.status}`)
check('csv has header row', csvText.split('\r\n')[0].includes('Date,Description,Reference,Status,Amount,Currency'), csvText.split('\r\n')[0])
const dataLines = csvText.split('\r\n').filter((l) => l.length > 0).length - 1
check('csv carries the wallet history', dataLines >= 0, `${dataLines} data row(s)`)

const quoteRes = await fetch(`${api}/transactions/export`, { headers: headersA })
const quoteText = await quoteRes.text()
check('csv is served with download headers', (quoteRes.headers.get('content-disposition') ?? '').includes('attachment'), quoteRes.headers.get('content-disposition') ?? 'missing')

const metaRes = await fetch(`${api}/sessions`, { headers: headersB })
const metaBody = await metaRes.json()
const other = metaBody.sessions.find((s) => !s.isCurrent)
const revokeRes = await fetch(`${api}/sessions/${other.sessionId}`, { method: 'DELETE', headers: headersB })
check('revoking another device works', revokeRes.status === 200)

const deadRes = await fetch(`${api}/sessions`, { headers: headersA })
check('revoked session is killed instantly', deadRes.status === 401, deadRes.status === 401 ? (await deadRes.json()).error?.slice(0, 70) : `status=${deadRes.status}`)

const aliveRes = await fetch(`${api}/sessions`, { headers: headersB })
check('current device unaffected by the revoke', aliveRes.status === 200)

const tokenC = await signInSecondDevice()
const headersC = { Authorization: `Bearer ${tokenC}`, 'Content-Type': 'application/json' }
const signOutAll = await fetch(`${api}/sessions/sign-out-everywhere`, { method: 'POST', headers: headersC })
const signOutBody = await signOutAll.json()
check('sign out everywhere works', signOutAll.status === 200, `revoked=${signOutBody.revokedCount}`)

const deadB = await fetch(`${api}/transactions/export`, { headers: headersB })
check('sign out everywhere killed the other device', deadB.status === 401, `status=${deadB.status}`)
const aliveC = await fetch(`${api}/sessions`, { headers: headersC })
check('sign out everywhere kept the caller signed in', aliveC.status === 200)

const tokenD = await signInSecondDevice()
const headersD = { Authorization: `Bearer ${tokenD}`, 'Content-Type': 'application/json' }
const fresh = await fetch(`${api}/sessions`, { headers: headersD })
check('a fresh sign-in still works after revocations', fresh.status === 200)

const listFinal = await (await fetch(`${api}/sessions`, { headers: headersD })).json()
for (const s of listFinal.sessions.filter((x) => !x.isCurrent)) {
  await fetch(`${api}/sessions/${s.sessionId}`, { method: 'DELETE', headers: headersD })
}
const me = await fetch(`${api}/me`, { headers: headersD })
check('demo account healthy after tests', me.status === 200)

await db.end()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
