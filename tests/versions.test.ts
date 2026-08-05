import { describe, it, expect } from 'vitest'
import { compareVersions, updateAvailable } from '../src/shared/versions'

describe('compareVersions', () => {
  it('orders plain semver', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
  })
  it('ignores v prefixes', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.1.0', 'v0.2.0')).toBe(-1)
  })
  it('handles uneven segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0', '1.0.1')).toBe(-1)
  })
  it('release outranks pre-release', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
})

describe('updateAvailable', () => {
  it('true only when latest is newer', () => {
    expect(updateAvailable('0.1.0', 'v0.2.0')).toBe(true)
    expect(updateAvailable('0.2.0', 'v0.2.0')).toBe(false)
    expect(updateAvailable('0.3.0', 'v0.2.0')).toBe(false)
  })
  it('false when either side is unknown', () => {
    expect(updateAvailable(null, 'v1.0.0')).toBe(false)
    expect(updateAvailable('1.0.0', null)).toBe(false)
  })
})

// icns → PNG extraction against real installed apps.
import { pngFromIcns } from '../src/main/status'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

describe('pngFromIcns', () => {
  it('rejects junk', () => {
    expect(pngFromIcns(Buffer.from('not an icns file'))).toBeNull()
    expect(pngFromIcns(Buffer.alloc(4))).toBeNull()
  })
  it('extracts a PNG from a real suite app icon', () => {
    const res = '/Applications/Slate.app/Contents/Resources'
    if (!existsSync(res)) return
    const icns = readdirSync(res).find((f) => f.endsWith('.icns'))
    if (!icns) return
    const png = pngFromIcns(readFileSync(join(res, icns)))
    expect(png).not.toBeNull()
    expect(png!.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })
})
