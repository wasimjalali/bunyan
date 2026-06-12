import { describe, expect, it } from 'vitest'
import { ARM_WINDOW_MS, LinkGuard, isLocalHostname, opensOnSingleClick } from './link-guard'

describe('opensOnSingleClick', () => {
  it('opens https on a single click', () => {
    expect(opensOnSingleClick('https://example.com/page')).toBe(true)
  })

  it('opens http localhost on a single click', () => {
    expect(opensOnSingleClick('http://localhost:3000/app')).toBe(true)
    expect(opensOnSingleClick('http://127.0.0.1:5173')).toBe(true)
    expect(opensOnSingleClick('http://[::1]:8080')).toBe(true)
    expect(opensOnSingleClick('http://0.0.0.0:4000')).toBe(true)
    expect(opensOnSingleClick('http://app.localhost:3000')).toBe(true)
  })

  it('holds back plain http on the open internet', () => {
    expect(opensOnSingleClick('http://example.com')).toBe(false)
    expect(opensOnSingleClick('http://93.184.216.34')).toBe(false)
  })

  it('does not treat lookalike hosts as local', () => {
    expect(opensOnSingleClick('http://localhost.evil.com')).toBe(false)
    expect(opensOnSingleClick('http://127.0.0.1.evil.com')).toBe(false)
    expect(opensOnSingleClick('http://1270.0.0.1')).toBe(false)
  })

  it('rejects unparseable and non-http schemes', () => {
    expect(opensOnSingleClick('not a url')).toBe(false)
    expect(opensOnSingleClick('ftp://example.com')).toBe(false)
  })
})

describe('isLocalHostname', () => {
  it('accepts the loopback range but validates octets', () => {
    expect(isLocalHostname('127.0.0.1')).toBe(true)
    expect(isLocalHostname('127.255.255.254')).toBe(true)
    expect(isLocalHostname('127.999.0.1')).toBe(false)
  })
})

describe('LinkGuard', () => {
  it('arms an insecure link, then opens on the confirm click', () => {
    const guard = new LinkGuard()
    expect(guard.decide('http://example.com', 1000)).toBe('arm')
    expect(guard.decide('http://example.com', 1500)).toBe('open')
  })

  it('expires the armed link after the window', () => {
    const guard = new LinkGuard()
    expect(guard.decide('http://example.com', 1000)).toBe('arm')
    expect(guard.decide('http://example.com', 1000 + ARM_WINDOW_MS + 1)).toBe('arm')
  })

  it('re-arms when a different link is clicked', () => {
    const guard = new LinkGuard()
    expect(guard.decide('http://a.com', 1000)).toBe('arm')
    expect(guard.decide('http://b.com', 1100)).toBe('arm')
    expect(guard.decide('http://a.com', 1200)).toBe('arm')
  })

  it('never delays a trusted link, even mid-arm', () => {
    const guard = new LinkGuard()
    expect(guard.decide('http://example.com', 1000)).toBe('arm')
    expect(guard.decide('https://example.com', 1100)).toBe('open')
    expect(guard.decide('http://localhost:3000', 1200)).toBe('open')
  })
})
