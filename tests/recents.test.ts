import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { slateRecents, circleTakeRecents, scriptbreakRecents, allRecents } from '../src/main/recents'
import registry from '../data/apps.json'
import type { SuiteApp } from '../src/shared/types'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'callsheet-test-'))

  // Slate: two projects, one malformed dir.
  const slate = join(root, 'slate')
  mkdirSync(join(slate, 'aaa'), { recursive: true })
  writeFileSync(
    join(slate, 'aaa', 'project.json'),
    JSON.stringify({ name: 'Night Market', updatedAt: '2026-08-01T10:00:00Z' })
  )
  mkdirSync(join(slate, 'bbb'), { recursive: true })
  writeFileSync(
    join(slate, 'bbb', 'project.json'),
    JSON.stringify({ name: 'The Miracle', updatedAt: '2026-08-04T10:00:00Z' })
  )
  mkdirSync(join(slate, 'junk'), { recursive: true })

  // Circle Take: one live project, one vanished temp path, one duplicate.
  const ctake = join(root, 'live.ctake')
  writeFileSync(ctake, '{}')
  writeFileSync(
    join(root, 'recents.json'),
    JSON.stringify([
      { path: ctake, name: 'Dailies A', openedAt: '2026-08-02T09:00:00Z' },
      { path: join(root, 'gone.ctake'), name: 'Vanished', openedAt: '2026-08-01T09:00:00Z' },
      { path: ctake, name: 'Dailies A', openedAt: '2026-07-30T09:00:00Z' }
    ])
  )

  // ScriptBreak: default project file.
  writeFileSync(
    join(root, 'project.scriptbreak'),
    JSON.stringify({
      app: 'scriptbreak',
      project: 'river-job',
      saved: '2026-08-03T12:00:00Z',
      state: { title: 'River Job' }
    })
  )
})

describe('recents adapters', () => {
  it('slate: reads projects, newest data intact, skips junk', async () => {
    const rows = await slateRecents(join(root, 'slate'))
    expect(rows.map((r) => r.name).sort()).toEqual(['Night Market', 'The Miracle'])
  })

  it('circle take: drops vanished paths and duplicates', async () => {
    const rows = await circleTakeRecents(join(root, 'recents.json'))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Dailies A')
  })

  it('scriptbreak: prefers the draft title', async () => {
    const rows = await scriptbreakRecents(join(root, 'project.scriptbreak'))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('River Job')
  })

  it('merges and sorts newest-first across apps', async () => {
    const rows = await allRecents(registry as SuiteApp[], {
      slateProjectsDir: join(root, 'slate'),
      circleTakeRecents: join(root, 'recents.json'),
      scriptbreakProject: join(root, 'project.scriptbreak')
    })
    expect(rows.map((r) => r.name)).toEqual(['The Miracle', 'River Job', 'Dailies A', 'Night Market'])
  })

  it('missing files yield empty lists, never throw', async () => {
    const rows = await allRecents(registry as SuiteApp[], {
      slateProjectsDir: join(root, 'nope'),
      circleTakeRecents: join(root, 'nope.json'),
      scriptbreakProject: join(root, 'nope.scriptbreak')
    })
    expect(rows).toEqual([])
  })
})

describe('registry', () => {
  it('every entry has the required fields and unique ids', () => {
    const ids = new Set<string>()
    for (const a of registry as SuiteApp[]) {
      expect(a.id).toBeTruthy()
      expect(a.name).toBeTruthy()
      expect(a.bundle).toBeTruthy()
      expect(a.stage).toBeTruthy()
      expect(a.tagline).toBeTruthy()
      expect(ids.has(a.id)).toBe(false)
      ids.add(a.id)
    }
    expect(ids.size).toBe(9)
    expect(ids.has('sam-pdf-studio')).toBe(false)
  })
})
