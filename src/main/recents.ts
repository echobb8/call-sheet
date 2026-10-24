// Recent-project adapters. Each reads an app's own on-disk records and maps
// them into RecentProject rows; every adapter is best-effort and returns []
// when the app has no data. Paths are injectable for tests.

import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { RecentProject, SuiteApp } from '../shared/types'

export interface AdapterPaths {
  slateProjectsDir: string
  circleTakeRecents: string
  scriptbreakProject: string
}

export function defaultPaths(): AdapterPaths {
  const home = homedir()
  const appData = join(home, 'Library', 'Application Support')
  return {
    slateProjectsDir: process.env.SLATE_DATA_DIR || join(home, 'Documents', 'Slate Biblical Cinema'),
    circleTakeRecents: join(appData, 'circle-take-biblical-period', 'recents.json'),
    scriptbreakProject: join(appData, 'com.wasserman.scriptbreak.biblical', 'project.scriptbreak')
  }
}

export async function slateRecents(dir: string): Promise<RecentProject[]> {
  const rows: RecentProject[] = []
  try {
    const ids = await fs.readdir(dir)
    for (const id of ids) {
      const file = join(dir, id, 'project.json')
      try {
        const p = JSON.parse(await fs.readFile(file, 'utf8')) as {
          name?: string
          updatedAt?: string
        }
        if (p.name) {
          rows.push({
            appId: 'slate',
            appName: 'Slate',
            name: p.name,
            path: file,
            when: p.updatedAt ?? null
          })
        }
      } catch {
        /* not a project dir */
      }
    }
  } catch {
    /* no Slate data yet */
  }
  return rows
}

export async function circleTakeRecents(file: string): Promise<RecentProject[]> {
  try {
    const list = JSON.parse(await fs.readFile(file, 'utf8')) as Array<{
      path?: string
      name?: string
      openedAt?: string
    }>
    const seen = new Set<string>()
    const rows: RecentProject[] = []
    for (const r of list) {
      if (!r.path || !r.name || seen.has(r.path)) continue
      if (!existsSync(r.path)) continue // temp/e2e projects vanish
      seen.add(r.path)
      rows.push({
        appId: 'circle-take',
        appName: 'Circle Take',
        name: r.name,
        path: r.path,
        when: r.openedAt ?? null
      })
    }
    return rows
  } catch {
    return []
  }
}

export async function scriptbreakRecents(file: string): Promise<RecentProject[]> {
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf8')) as {
      project?: string
      saved?: string
      state?: { title?: string }
    }
    const name = doc.state?.title || doc.project
    if (!name) return []
    return [
      {
        appId: 'scriptbreak',
        appName: 'ScriptBreak',
        name,
        path: file,
        when: doc.saved ?? null
      }
    ]
  } catch {
    return []
  }
}

export async function allRecents(
  registry: SuiteApp[],
  paths: AdapterPaths = defaultPaths()
): Promise<RecentProject[]> {
  const wanted = new Set(registry.map((a) => a.recents).filter(Boolean))
  const batches = await Promise.all([
    wanted.has('slate') ? slateRecents(paths.slateProjectsDir) : [],
    wanted.has('circle-take') ? circleTakeRecents(paths.circleTakeRecents) : [],
    wanted.has('scriptbreak') ? scriptbreakRecents(paths.scriptbreakProject) : []
  ])
  return batches
    .flat()
    .sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''))
    .slice(0, 20)
}
