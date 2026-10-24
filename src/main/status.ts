// App detection, versions, icons, and latest-release checks.

import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import type { AppStatus, SuiteApp } from '../shared/types'
import { updateAvailable } from '../shared/versions'

export function appPath(a: SuiteApp): string {
  return `/Applications/${a.bundle}.app`
}

function plistVersion(bundlePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleShortVersionString', join(bundlePath, 'Contents', 'Info.plist')],
      { timeout: 5000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null)
    )
  })
}

// Pure-Node app icon: parse the bundle's .icns and pull the best PNG entry.
// (app.getFileIcon crashes under headless launch contexts; this never can.)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const ICON_TYPES_BY_PREFERENCE = ['ic10', 'ic09', 'ic14', 'ic08', 'ic13', 'ic07', 'ic12', 'ic11']

function plistIconFile(bundlePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleIconFile', join(bundlePath, 'Contents', 'Info.plist')],
      { timeout: 5000 },
      (err, stdout) => resolve(err ? null : stdout.trim() || null)
    )
  })
}

export function pngFromIcns(icns: Buffer): Buffer | null {
  if (icns.length < 8 || icns.toString('ascii', 0, 4) !== 'icns') return null
  const entries = new Map<string, Buffer>()
  let off = 8
  while (off + 8 <= icns.length) {
    const type = icns.toString('ascii', off, off + 4)
    const len = icns.readUInt32BE(off + 4)
    if (len < 8 || off + len > icns.length) break
    entries.set(type, icns.subarray(off + 8, off + len))
    off += len
  }
  for (const t of ICON_TYPES_BY_PREFERENCE) {
    const data = entries.get(t)
    if (data && data.subarray(0, 4).equals(PNG_MAGIC)) return data
  }
  // Any PNG-encoded entry beats nothing.
  for (const data of entries.values()) {
    if (data.subarray(0, 4).equals(PNG_MAGIC)) return data
  }
  return null
}

async function appIcon(bundlePath: string): Promise<string | null> {
  try {
    const resources = join(bundlePath, 'Contents', 'Resources')
    const named = await plistIconFile(bundlePath)
    const candidates: string[] = []
    if (named) candidates.push(named.endsWith('.icns') ? named : `${named}.icns`)
    for (const f of readdirSync(resources)) {
      if (f.endsWith('.icns') && !candidates.includes(f)) candidates.push(f)
    }
    for (const f of candidates) {
      const file = join(resources, f)
      if (!existsSync(file)) continue
      const png = pngFromIcns(readFileSync(file))
      if (png) return `data:image/png;base64,${png.toString('base64')}`
    }
  } catch {
    /* icon is decoration */
  }
  return null
}

// ---- latest releases (GitHub, anonymous, cached) ----

interface ReleaseCacheEntry {
  tag: string | null
  url: string | null
  fetchedAt: number
}
type ReleaseCache = Record<string, ReleaseCacheEntry>

const CACHE_TTL_MS = 60 * 60 * 1000

function cacheFile(): string {
  return join(app.getPath('userData'), 'releases-cache.json')
}

function readCache(): ReleaseCache {
  try {
    return JSON.parse(readFileSync(cacheFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(c: ReleaseCache): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(cacheFile(), JSON.stringify(c, null, 2))
  } catch {
    /* cache is best-effort */
  }
}

async function fetchLatest(repo: string): Promise<{ tag: string | null; url: string | null } | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`https://api.github.com/repos/echobb8/${repo}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'call-sheet' },
      signal: ctrl.signal
    })
    clearTimeout(t)
    if (res.status === 404) return { tag: null, url: null } // repo private or no releases
    if (!res.ok) return null // rate-limited or transient — treat as offline
    const releases = (await res.json()) as Array<{ tag_name?: string; html_url?: string }>
    const body = releases.find((release) => release.tag_name?.startsWith('biblical-period-')) ?? {}
    return { tag: body.tag_name?.replace(/^biblical-period-/, '') ?? null, url: body.html_url ?? null }
  } catch {
    return null
  }
}

export interface LatestResult {
  byRepo: Record<string, { tag: string | null; url: string | null }>
  offline: boolean
}

/** Latest release tags for the given repos, via a 1-hour on-disk cache.
 *  Never throws; a failed fetch falls back to stale cache and flags offline. */
export async function latestReleases(repos: string[], force = false): Promise<LatestResult> {
  const cache = readCache()
  const now = Date.now()
  const byRepo: LatestResult['byRepo'] = {}
  let offline = false
  await Promise.all(
    repos.map(async (repo) => {
      const hit = cache[repo]
      if (!force && hit && now - hit.fetchedAt < CACHE_TTL_MS) {
        byRepo[repo] = { tag: hit.tag, url: hit.url }
        return
      }
      const live = await fetchLatest(repo)
      if (live) {
        cache[repo] = { ...live, fetchedAt: now }
        byRepo[repo] = live
      } else {
        offline = true
        byRepo[repo] = hit ? { tag: hit.tag, url: hit.url } : { tag: null, url: null }
      }
    })
  )
  writeCache(cache)
  return { byRepo, offline }
}

export async function buildStatuses(
  registry: SuiteApp[],
  force = false
): Promise<{ apps: AppStatus[]; offline: boolean }> {
  const repos = registry.map((a) => a.repo).filter((r): r is string => r !== null)
  const latest = await latestReleases(repos, force)
  const apps = await Promise.all(
    registry.map(async (a): Promise<AppStatus> => {
      const path = appPath(a)
      const installed = existsSync(path)
      const [installedVersion, iconDataUrl] = installed
        ? await Promise.all([plistVersion(path), appIcon(path)])
        : [null, null]
      const rel = a.repo ? latest.byRepo[a.repo] : { tag: null, url: null }
      return {
        id: a.id,
        name: a.name,
        stage: a.stage,
        tagline: a.tagline,
        repo: a.repo,
        installed,
        installedVersion,
        latestVersion: rel.tag,
        latestUrl: rel.url,
        updateAvailable: updateAvailable(installedVersion, rel.tag),
        iconDataUrl
      }
    })
  )
  return { apps, offline: latest.offline }
}
