// Hilfen für Unit-Tests und den Dev-Seed. Kein Produktivcode hängt davon ab.
import { mondayOf } from './dates'
import type { SessionLog, SetLog, Side } from './types'

let counter = 0
const nextId = (p: string) => `${p}-${++counter}`

export function makeSession(p: Partial<SessionLog> & { date: string }): SessionLog {
  const startedAt = Date.parse(`${p.date}T17:00:00Z`)
  return {
    id: nextId('s'),
    sessionTemplateId: 'lower_a',
    sessionName: 'Test',
    sessionType: 'pflicht',
    focus: 'lower',
    planVersion: '1.0.0',
    programWeek: 2,
    weekType: 'normal',
    block: 1,
    taper: false,
    startedAt,
    endedAt: startedAt + 3_600_000,
    status: 'completed',
    kneeStatus: 'green',
    plannedUnits: 10,
    choices: {},
    skipped: [],
    ...p,
  }
}

export function makeSets(
  session: SessionLog,
  exerciseId: string,
  side: Side | null,
  rows: [weightKg: number, reps: number, rir?: number | null][],
  extra: Partial<SetLog> = {},
): SetLog[] {
  return rows.map(([weightKg, reps, rir], i) => ({
    id: nextId('set'),
    sessionId: session.id,
    date: session.date,
    exerciseId,
    variantId: null,
    exerciseName: exerciseId,
    side,
    setIndex: i,
    weightKg,
    reps,
    seconds: null,
    rir: rir ?? null,
    targetRirLow: 2,
    schonmodus: false,
    loggedAt: session.startedAt + i * 120_000,
    ...extra,
  }))
}

/** Vier Pflichteinheiten einer Woche (Mo, Di, Do, Fr). */
export function fullWeek(monday: string, templates: string[], p: Partial<SessionLog> = {}): SessionLog[] {
  const offsets = [0, 1, 3, 4]
  const base = Date.parse(`${mondayOf(monday)}T12:00:00Z`)
  return templates.map((sessionTemplateId, i) =>
    makeSession({
      date: new Date(base + offsets[i % 4]! * 86_400_000).toISOString().slice(0, 10),
      sessionTemplateId,
      ...p,
    }),
  )
}
