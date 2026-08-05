// Shared shapes between main and renderer.

export interface SuiteApp {
  id: string
  name: string
  /** .app bundle name in /Applications (without extension). */
  bundle: string
  /** GitHub repo under wassermanproductions, or null if not yet public. */
  repo: string | null
  tagline: string
  /** One-word pipeline stage shown as the card kicker. */
  stage: string
  /** Which recents adapter understands this app's projects. */
  recents?: 'slate' | 'circle-take' | 'scriptbreak'
}

export interface AppStatus {
  id: string
  name: string
  stage: string
  tagline: string
  repo: string | null
  installed: boolean
  installedVersion: string | null
  latestVersion: string | null
  latestUrl: string | null
  updateAvailable: boolean
  iconDataUrl: string | null
}

export interface RecentProject {
  appId: string
  appName: string
  name: string
  path: string
  /** ISO timestamp of last save/open, when the app records one. */
  when: string | null
}

export interface DashboardState {
  apps: AppStatus[]
  recents: RecentProject[]
  checkedAt: string | null
  /** True when the latest-release check used cached data (offline). */
  offline: boolean
}

export interface CallSheetApi {
  getState(refresh?: boolean): Promise<DashboardState>
  launch(appId: string): Promise<{ ok: boolean; error?: string }>
  openRepo(appId: string): Promise<void>
  openLatest(appId: string): Promise<void>
  reveal(path: string): Promise<void>
  openSuiteHub(): Promise<void>
  getLoginItem(): Promise<boolean>
  setLoginItem(open: boolean): Promise<void>
  onStateChanged(cb: () => void): () => void
}
