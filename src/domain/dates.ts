import type { DateStr } from './types'

// Tage sind lokale Datumsstrings. Gerechnet wird auf dem Kalender (UTC-Mittag als neutraler
// Träger), nie mit 24-h-Schritten auf Zeitstempeln – so bleiben Sommerzeitwechsel folgenlos.

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Lokales Datum eines Zeitstempels in der gegebenen Zeitzone. */
export function localDate(ts: number, timeZone: string): DateStr {
  let fmt = formatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, fmt)
  }
  return fmt.format(ts)
}

function toUtc(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!, 12)
}

function fromUtc(ms: number): DateStr {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY = 86_400_000

export function isDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromUtc(toUtc(date) + days * DAY)
}

/** Ganze Kalendertage von `from` bis `to` (positiv, wenn `to` später liegt). */
export function diffDays(to: DateStr, from: DateStr): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY)
}

/** 0 = Montag … 6 = Sonntag. */
export function weekdayIndex(date: DateStr): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

export function mondayOf(date: DateStr): DateStr {
  return addDays(date, -weekdayIndex(date))
}

export function sundayOf(date: DateStr): DateStr {
  return addDays(mondayOf(date), 6)
}

/** Vorschlag für den Programmstart: aktueller Montag bei Mo–Mi, sonst nächster Montag. */
export function suggestProgramStart(today: DateStr): DateStr {
  const monday = mondayOf(today)
  return weekdayIndex(today) <= 2 ? monday : addDays(monday, 7)
}

export function formatDateDe(date: DateStr): string {
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}
