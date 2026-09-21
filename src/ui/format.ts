const kgFmt = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const intFmt = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0, useGrouping: true })

export const formatKg = (kg: number) => kgFmt.format(kg)
export const formatInt = (n: number) => intFmt.format(n).replace(/\./g, ' ')
export const formatPct = (ratio: number) => `${Math.round(ratio * 100)} %`

/** Zahl mit deutschem Komma lesen; null bei leerer oder ungültiger Eingabe. */
export function parseDe(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '' || !/^\d*\.?\d*$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatRange(range: [number, number] | null, unit = ''): string {
  if (!range) return ''
  const [lo, hi] = range
  return `${lo === hi ? lo : `${lo}–${hi}`}${unit}`
}
