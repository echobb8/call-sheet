import { EDITION_LABEL } from '../../shared/production'
import React, { useEffect, useMemo, useState } from 'react'
import type { AppStatus, DashboardState, RecentProject } from '../../shared/types'

function fmtDay(d: Date): string {
  return d
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<DashboardState | null>(null)
  const [busy, setBusy] = useState(false)
  const [loginItem, setLoginItem] = useState(false)

  const load = async (refresh = false): Promise<void> => {
    setBusy(true)
    try {
      setState(await window.callsheet.getState(refresh))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    void window.callsheet.getLoginItem().then(setLoginItem)
  }, [])

  const updates = useMemo(() => state?.apps.filter((a) => a.updateAvailable) ?? [], [state])
  const installedCount = state?.apps.filter((a) => a.installed).length ?? 0

  return (
    <div className="shell">
      <header className="masthead">
        <div className="mast-left">
          <span className="mast-mark">◈</span>
          <div>
            <h1>call sheet</h1>
            <div className="mast-sub">{EDITION_LABEL} · {fmtDay(new Date())}</div>
          </div>
        </div>
        <div className="mast-right">
          <span className="mast-note">
            {installedCount}/{state?.apps.length ?? 0} INSTALLED
            {updates.length > 0 && <em> · {updates.length} UPDATE{updates.length > 1 ? 'S' : ''}</em>}
            {state?.offline && <em className="offline"> · OFFLINE — CACHED</em>}
          </span>
          <button className="btn ghost" disabled={busy} onClick={() => void load(true)}>
            {busy ? 'Checking…' : 'Check updates'}
          </button>
        </div>
      </header>

      <main className="columns">
        <section className="apps">
          <div className="col-head">ON THE LOT</div>
          <div className="grid">
            {(state?.apps ?? []).map((a) => (
              <AppCard key={a.id} app={a} />
            ))}
          </div>
        </section>

        <aside className="side">
          <div className="col-head">RECENT PROJECTS</div>
          <div className="recents">
            {(state?.recents ?? []).length === 0 && (
              <div className="empty">No recent projects found yet — they appear here as you work.</div>
            )}
            {(state?.recents ?? []).map((r) => (
              <RecentRow key={`${r.appId}:${r.path}`} r={r} />
            ))}
          </div>

          <div className="col-head" style={{ marginTop: 22 }}>SETTINGS</div>
          <label className="setting">
            <input
              type="checkbox"
              checked={loginItem}
              onChange={(e) => {
                setLoginItem(e.target.checked)
                void window.callsheet.setLoginItem(e.target.checked)
              }}
            />
            Launch at login (lives in the menu bar)
          </label>
          <button className="btn ghost wide" onClick={() => void window.callsheet.openSuiteHub()}>
            Suite on GitHub ↗
          </button>

          <div className="col-head" style={{ marginTop: 22 }}>SUPPORT</div>
          <a className="btn accent wide kofi" href="https://ko-fi.com/samwasserman" target="_blank" rel="noreferrer">
            ♥ Support on Ko-fi
          </a>
          <div className="credit">
            Created by <b>Sam Wasserman</b>
            <br />
            <a href="https://wassermanproductions.com" target="_blank" rel="noreferrer">
              wassermanproductions.com
            </a>
            <br />
            <a href="https://wasserman.ai" target="_blank" rel="noreferrer">
              wasserman.ai
            </a>
          </div>
        </aside>
      </main>
    </div>
  )
}

function AppCard({ app }: { app: AppStatus }): React.JSX.Element {
  const [err, setErr] = useState<string | null>(null)
  const status = !app.installed
    ? app.repo
      ? 'GET'
      : 'SOON'
    : app.updateAvailable
      ? 'UPDATE'
      : 'READY'

  return (
    <div className={`card ${app.installed ? '' : 'card-missing'}`}>
      <div className="card-top">
        {app.iconDataUrl ? (
          <img className="app-icon" src={app.iconDataUrl} alt="" />
        ) : (
          <div className="app-icon app-icon-blank">◈</div>
        )}
        <div className="card-id">
          <div className="stage">{app.stage}</div>
          <div className="name">{app.name}</div>
          <div className="vers">
            {app.installed ? `v${app.installedVersion ?? '?'}` : 'not installed'}
            {app.updateAvailable && app.latestVersion && (
              <em> → {app.latestVersion.replace(/^v/, '')}</em>
            )}
          </div>
        </div>
        <span className={`chip chip-${status.toLowerCase()}`}>{status}</span>
      </div>
      <div className="tagline">{app.tagline}</div>
      <div className="card-actions">
        {app.installed && (
          <button
            className="btn"
            onClick={() =>
              void window.callsheet.launch(app.id).then((r) => setErr(r.ok ? null : r.error ?? null))
            }
          >
            Launch
          </button>
        )}
        {app.updateAvailable && (
          <button className="btn accent" onClick={() => void window.callsheet.openLatest(app.id)}>
            Get {app.latestVersion?.replace(/^v/, '')}
          </button>
        )}
        {!app.installed && app.repo && (
          <button className="btn accent" onClick={() => void window.callsheet.openLatest(app.id)}>
            Build source
          </button>
        )}
        {app.repo && (
          <button className="btn ghost" onClick={() => void window.callsheet.openRepo(app.id)}>
            Repo
          </button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}

function RecentRow({ r }: { r: RecentProject }): React.JSX.Element {
  return (
    <button className="recent" onClick={() => void window.callsheet.reveal(r.path)} title={r.path}>
      <span className="recent-app">{r.appName}</span>
      <span className="recent-name">{r.name}</span>
      <span className="recent-when">{ago(r.when)}</span>
    </button>
  )
}
