import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const clientEnv = {}
for (const line of readFileSync(new URL('../../client/.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) clientEnv[m[1]] = m[2].trim()
}

const url = env.SUPABASE_URL
const anon = clientEnv.VITE_SUPABASE_ANON_KEY
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY)

const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const users = await admin.auth.admin.listUsers()
const demo = users.data.users.find((u) => u.email === 'demo@wallet.local')
const friend = users.data.users.find((u) => u.email === 'friend@wallet.local')
check('demo and friend accounts exist', !!demo && !!friend)

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const guest = createClient(url, anon)
const { error: guestErr } = await guest.storage
  .from('avatars')
  .upload(`${demo.id}/avatar`, png, { contentType: 'image/png', upsert: true })
check('anonymous upload is refused', !!guestErr, guestErr?.message ?? '')

const asDemo = createClient(url, anon)
const { error: signInErr } = await asDemo.auth.signInWithPassword({
  email: 'demo@wallet.local',
  password: 'demo1234'
})
check('demo sign-in works', !signInErr, signInErr?.message ?? '')

const { error: upErr } = await asDemo.storage
  .from('avatars')
  .upload(`${demo.id}/avatar`, png, { contentType: 'image/png', upsert: true })
check('owner can upload their avatar', !upErr, upErr?.message ?? '')

const { data: pub } = asDemo.storage.from('avatars').getPublicUrl(`${demo.id}/avatar`)
const res = await fetch(pub.publicUrl)
check('public read works without a session', res.ok, `status ${res.status}`)

const asFriend = createClient(url, anon)
await asFriend.auth.signInWithPassword({ email: 'friend@wallet.local', password: 'demo1234' })
const { error: crossErr } = await asFriend.storage
  .from('avatars')
  .upload(`${demo.id}/avatar`, png, { contentType: 'image/png', upsert: true })
check("another user cannot write into someone else's folder", !!crossErr, crossErr?.message ?? '')

const { error: delErr } = await admin.storage.from('avatars').remove([`${demo.id}/avatar`])
check('cleanup removed the test object', !delErr, delErr?.message ?? '')
