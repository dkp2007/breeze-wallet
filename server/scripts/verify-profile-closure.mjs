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

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const password = 'close-test-1234'
const email = `closer-${randomUUID().slice(0, 8)}@example.com`
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Close Me' }
})
if (createError || !created.user) {
  console.log('FAIL could not create temp user —', createError?.message)
  process.exit(1)
}
const userId = created.user.id
console.log(`temp user: ${email} (${userId})`)

const cleanup = async () => {
  await admin.auth.admin.deleteUser(userId).catch(() => {})
}

try {
  const signIn = async () => {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    return (await res.json()).access_token
  }
  let token = await signIn()
  const call = async (method, path, body, useToken = token) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useToken}` },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  const patch = await call('PATCH', '/me', {
    fullName: 'Dhruv Kumar Pandit',
    phone: '+91 98765 43210',
    city: 'Mumbai',
    bio: 'Testing the wallet.'
  })
  check('profile fields save', patch.status === 200, JSON.stringify(patch.body).slice(0, 120))

  const me = await call('GET', '/me')
  const d = me.body.profileDetails
  check(
    'fields round-trip through /me',
    d?.fullName === 'Dhruv Kumar Pandit' && d?.phone === '+91 98765 43210' && d?.city === 'Mumbai' && d?.bio === 'Testing the wallet.',
    JSON.stringify(d)
  )

  const evil = await call('PATCH', '/me', { avatarUrl: 'https://evil.example.com/face.png' })
  check('foreign avatar URL refused', evil.status === 400, evil.body.error ?? '')

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/avatars/${userId}/avatar.png`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body: png
  })
  const upBody = await up.json().catch(() => ({}))
  check('avatar uploads to own storage folder', up.status === 200, JSON.stringify(upBody).slice(0, 120))

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/avatar.png`
  const setAvatar = await call('PATCH', '/me', { avatarUrl: publicUrl })
  check('avatar URL accepted', setAvatar.status === 200)

  const meAvatar = await call('GET', '/me')
  check('avatar URL round-trips', meAvatar.body.profileDetails?.avatarUrl === publicUrl)

  const grab = await fetch(publicUrl)
  check('avatar is publicly readable', grab.status === 200)

  const foreign = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/avatars/${userId}/../other${userId.slice(0, 8)}/avatar.png`,
    { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: png }
  ).catch(() => null)
  console.log(`INFO foreign-folder write attempt → ${foreign ? foreign.status : 'network error'} (400/403 expected)`)

  const wrong = await fetch(`${api}/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password: 'not-the-password' })
  })
  check('closure refuses a wrong password', wrong.status === 403)

  const { Client } = await import('pg')
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query('update wallets set balance = 5000 where user_id = $1', [userId])
  const withMoney = await call('DELETE', '/me', { password })
  check('closure refuses while the wallet holds money', withMoney.status === 400, withMoney.body.error ?? '')

  const { rows: txRows } = await client.query(
    'insert into transactions (user_id, type, amount, status) values ($1, $2, 100, $3) returning id',
    [userId, 'deposit', 'completed']
  )
  await client.query('update wallets set balance = 0 where user_id = $1', [userId])

  const bye = await call('DELETE', '/me', { password })
  check('closure succeeds with empty wallet', bye.status === 200, JSON.stringify(bye.body).slice(0, 120))

  const { rows: profileGone } = await client.query('select 1 from profiles where id = $1', [userId])
  const { rows: walletGone } = await client.query('select 1 from wallets where user_id = $1', [userId])
  const { rows: txGone } = await client.query('select 1 from transactions where user_id = $1', [userId])
  await client.end()
  check('profile row is gone', profileGone.length === 0)
  check('wallet row is gone', walletGone.length === 0)
  check('transaction rows are gone', txGone.length === 0)

  const authAfter = await admin.auth.admin.getUserById(userId)
  check('auth account is gone', !!authAfter.error)

  const dead = await call('GET', '/me', undefined, token)
  check('old token is dead afterwards', dead.status === 401 || dead.status === 403, `status=${dead.status}`)
} catch (error) {
  console.log('ERROR unexpected —', error.message)
  process.exitCode = 1
} finally {
  await cleanup()
  console.log('cleanup: temp user removed from auth (any leftover rows cascade)')
}
console.log('done')
