import { describe, expect, it } from 'vitest'
import { extractTokenMeta, parseUserAgent } from '../src/lib/sessions.js'

describe('device parsing', () => {
  it('names a chrome windows desktop', () => {
    const device = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    )
    expect(device.browser).toBe('Chrome')
    expect(device.os).toBe('Windows')
    expect(device.device_type).toBe('desktop')
    expect(device.device_name).toBe('Chrome on Windows')
  })

  it('names an iphone safari mobile', () => {
    const device = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    )
    expect(device.browser).toBe('Safari')
    expect(device.os).toBe('iOS')
    expect(device.device_type).toBe('mobile')
  })

  it('falls back for empty and junk strings', () => {
    expect(parseUserAgent('').device_name).toBe('Unrecognized device')
    expect(parseUserAgent('gremlin/1.0').device_name).toBe('Unrecognized device')
  })
})

describe('extractTokenMeta', () => {
  function claimsToken(payload: object): string {
    const b64 = (value: string) => Buffer.from(value).toString('base64url')
    return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.sig`
  }

  it('reads session and jti from valid claims', () => {
    const meta = extractTokenMeta(claimsToken({ session_id: 's1', jti: 'j1' }))
    expect(meta).toEqual({ sessionId: 's1', jti: 'j1' })
  })

  it('rejects tokens missing the session id', () => {
    expect(extractTokenMeta(claimsToken({ jti: 'j1' }))).toBeNull()
    expect(extractTokenMeta(claimsToken({}))).toBeNull()
    expect(extractTokenMeta('garbage')).toBeNull()
  })
})
