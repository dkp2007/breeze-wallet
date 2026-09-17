import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const envText = readFileSync(new URL('../../client/.env', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=')
      return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const API = 'http://localhost:4000/api'
const EMAIL = 'demo@wallet.local'
const PASSWORD = 'demo1234'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(input) {
  let bits = 0
  let value = 0
  const out = []
  for (const char of input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) {
    const idx = B32.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

async function totpCode(secret, stepOffset = 0) {
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 30000) + stepOffset
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const bin =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

function aalOf(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal ?? null
  } catch {
    return null
  }
}

const rows = []
function check(name, pass, detail = '') {
  rows.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function callApi(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { status: res.status, body }
}

async function enrollFreshFactor() {
  const { data: existing } = await supabase.auth.mfa.listFactors()
  for (const factor of existing?.all ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }
  const { data: enrollData, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  const secret = enrollData.totp.secret
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollData.id })
  if (challengeError) throw challengeError
  let verified = false
  let lastError = 'no attempts'
  for (const offset of [-2, -1, 0, 1, 2]) {
    const code = await totpCode(secret, offset)
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollData.id,
      challengeId: challengeData.id,
      code
    })
    if (!verifyError) {
      verified = true
      break
    }
    lastError = verifyError.message
  }
  if (!verified) throw new Error(`could not verify the new factor with a live code: ${lastError}`)
  return secret
}

try {
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signInError) throw signInError
  const passwordOnlyToken = signIn.session.access_token
  check('password-only sign-in', aalOf(passwordOnlyToken) === 'aal1', `aal=${aalOf(passwordOnlyToken)}`)

  const secret = await enrollFreshFactor()
  check('code enrollment with a live generated code', true, 'real six-digit code verified')

  const { status: rejectStatus, body: rejectBody } = await callApi('/me', passwordOnlyToken)
  check(
    'API rejects the password-only token',
    rejectStatus === 403 && rejectBody?.code === 'mfa_required',
    `status=${rejectStatus} code=${rejectBody?.code ?? 'none'}`
  )

  const verifiedFactorId = (await supabase.auth.mfa.listFactors()).data.totp.find((f) => f.status === 'verified').id
  let upgraded = false
  for (const offset of [-2, -1, 0, 1, 2]) {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedFactorId })
    if (challengeError) throw challengeError
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: verifiedFactorId,
      challengeId: challengeData.id,
      code: await totpCode(secret, offset)
    })
    if (!verifyError) {
      upgraded = true
      break
    }
  }
  check('second-step challenge accepted', upgraded)
  if (!upgraded) throw new Error('aal upgrade failed')

  const upgradedToken = (await supabase.auth.getSession()).data.session.access_token
  check('session upgraded to aal2', aalOf(upgradedToken) === 'aal2', `aal=${aalOf(upgradedToken)}`)

  const { status: okStatus } = await callApi('/me', upgradedToken)
  check('API accepts the token after the second step', okStatus === 200, `status=${okStatus}`)
} catch (err) {
  check('unexpected failure', false, err instanceof Error ? err.message : String(err))
} finally {
  try {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    for (const factor of factors?.all ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
    await supabase.auth.signOut()
    console.log('cleanup: factor removed, demo account back to password-only, signed out')
  } catch (cleanupErr) {
    console.log('cleanup warning:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr)
  }
  const passed = rows.length > 0 && rows.every(Boolean)
  console.log(passed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED')
  process.exit(passed ? 0 : 1)
}
