// Version comparison for update checks. Tolerates 'v' prefixes and uneven
// segment counts; non-numeric segments compare as strings after numerics.

export function parseVersion(v: string): Array<number | string> {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((seg) => (/^\d+$/.test(seg) ? parseInt(seg, 10) : seg.toLowerCase()))
}

/** -1 when a < b, 0 when equal, 1 when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1
    } else {
      // A numeric segment outranks a pre-release string ('1.0.0' > '1.0.0-beta').
      if (typeof x === 'number' && typeof y === 'string') return 1
      if (typeof x === 'string' && typeof y === 'number') return -1
      if (x !== y) return x < y ? -1 : 1
    }
  }
  return 0
}

export function updateAvailable(installed: string | null, latest: string | null): boolean {
  if (!installed || !latest) return false
  return compareVersions(installed, latest) < 0
}
