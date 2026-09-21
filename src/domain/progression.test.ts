import { describe, expect, it } from 'vitest'
import { recommend, type HistoryInput } from './progression'
import { resolveSession } from './sessionPlan'
import { makeSession, makeSets } from './testkit'
import { loadTestPlan } from './testplan.node'
import type { SessionLog, SetLog } from './types'

const plan = loadTestPlan()
const normalCtx = { weekType: 'normal', taper: false, programWeek: 3, block: 1 } as const
const item = (sessionId: string, exerciseId: string, knee: 'green' | 'yellow' = 'green', ctx = normalCtx) =>
  resolveSession(plan, sessionId, ctx, knee).items.find((i) => i.exerciseId === exerciseId)!

function history(...entries: [SessionLog, SetLog[]][]): HistoryInput {
  return {
    sets: entries.flatMap(([, sets]) => sets),
    sessionsById: new Map(entries.map(([s]) => [s.id, s])),
  }
}

describe('Doppelte Progression', () => {
  const press = item('lower_a', 'legpress_bilateral') // 3 × 6–8, RIR 2, +5 kg

  it('ohne Vorgeschichte und in der Kalibrierung: Last finden', () => {
    expect(recommend(plan, press, null, history(), normalCtx).kind).toBe('find')
    const s = makeSession({ date: '2026-09-22', programWeek: 1, weekType: 'calibration' })
    const h = history([s, makeSets(s, 'legpress_bilateral', null, [[100, 8], [100, 8]])])
    expect(recommend(plan, press, null, h, { ...normalCtx, weekType: 'calibration', programWeek: 1 }).kind).toBe('find')
  })

  it('alle Sätze am oberen Wert: +incrementKg, Wiederholungen ab unterem Wert', () => {
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, makeSets(s, 'legpress_bilateral', null, [[100, 8, 2], [100, 8, 2], [100, 8, 2]])])
    expect(recommend(plan, press, null, h, normalCtx)).toMatchObject({ kind: 'load', weightKg: 105, target: 6, increased: true })
  })

  it('sonst gleiche Last, Ziel +1 Wiederholung', () => {
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, makeSets(s, 'legpress_bilateral', null, [[100, 8], [100, 7], [100, 6]])])
    expect(recommend(plan, press, null, h, normalCtx)).toMatchObject({ weightKg: 100, target: 7, increased: false })
  })

  it('obere Zahl ohne Ziel-RIR reicht nicht', () => {
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, makeSets(s, 'legpress_bilateral', null, [[100, 8, 2], [100, 8, 1], [100, 8, 0]])])
    expect(recommend(plan, press, null, h, normalCtx)).toMatchObject({ weightKg: 100, target: 8, increased: false })
  })

  it('letzter Satz bis zum Versagen ist erlaubt, wo der Plan es zulässt', () => {
    const curl = item('upper_a', 'ez_curl') // 8–12, RIR 0–2, lastSetToFailureAllowed
    const s = makeSession({ date: '2026-09-29', sessionTemplateId: 'upper_a', focus: 'upper' })
    const h = history([s, makeSets(s, 'ez_curl', null, [[30, 12, 1], [30, 12, 1], [30, 12, 0]])])
    expect(recommend(plan, curl, null, h, normalCtx)).toMatchObject({ weightKg: 32.5, increased: true })
  })

  it('jede Seite hat ihre eigene Progression', () => {
    const single = item('lower_a', 'legpress_single') // 8–12
    const s = makeSession({ date: '2026-09-29' })
    const h = history([
      s,
      [
        ...makeSets(s, 'legpress_single', 'R', [[50, 12, 2], [50, 12, 2], [50, 12, 2]]),
        ...makeSets(s, 'legpress_single', 'L', [[70, 10, 2], [70, 9, 2], [70, 9, 2]]),
      ],
    ])
    expect(recommend(plan, single, 'R', h, normalCtx)).toMatchObject({ weightKg: 55, target: 8 })
    expect(recommend(plan, single, 'L', h, normalCtx)).toMatchObject({ weightKg: 70, target: 10 })
  })

  it('Laststufe lässt sich überschreiben', () => {
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, makeSets(s, 'legpress_bilateral', null, [[100, 8], [100, 8], [100, 8]])])
    expect(recommend(plan, press, null, h, normalCtx, { incrementOverride: 2.5 }).weightKg).toBe(102.5)
  })

  it('Zeitübungen steigern über den oberen Sekundenwert', () => {
    const wall = item('lower_a', 'wallsit_weighted') // 2 × 30–45 s, +2,5 kg
    const s = makeSession({ date: '2026-09-29' })
    const sets = makeSets(s, 'wallsit_weighted', null, [[10, 0], [10, 0]], { reps: null, seconds: 45 })
    const rec = recommend(plan, wall, null, history([s, sets]), normalCtx)
    expect(rec).toMatchObject({ weightKg: 12.5, target: 30 })
    expect(rec.prefill).toMatchObject({ weightKg: 12.5, seconds: 30, reps: null })
  })

  it('Körpergewicht: von 0 kg auf die erste Laststufe', () => {
    const calf = item('upper_a', 'calf_raise_stepper')
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, makeSets(s, 'calf_raise_stepper', null, [[0, 15, 2], [0, 15, 2], [0, 15, 1]])])
    expect(recommend(plan, calf, null, h, normalCtx).weightKg).toBe(2.5)
  })
})

describe('Schonmodus, Deload, Taper', () => {
  const allTop = (s: SessionLog, extra: Partial<SetLog> = {}) =>
    makeSets(s, 'legpress_bilateral', null, [[100, 8, 2], [100, 8, 2], [100, 8, 2]], extra)

  it('Gelb: Empfehlung mal loadFactor, auf 0,5 kg abgerundet', () => {
    const s = makeSession({ date: '2026-09-29' })
    const rec = recommend(plan, item('lower_a', 'legpress_bilateral', 'yellow'), null, history([s, allTop(s)]), normalCtx)
    expect(rec.weightKg).toBe(84) // (100 + 5) × 0,8
  })

  it('Schonmodus- und Deload-Sätze sind keine Grundlage', () => {
    const regular = makeSession({ date: '2026-09-29' })
    const yellow = makeSession({ date: '2026-10-06', kneeStatus: 'yellow' })
    const deload = makeSession({ date: '2026-10-20', weekType: 'deload', programWeek: 5 })
    const h = history(
      [regular, allTop(regular)],
      [yellow, makeSets(yellow, 'legpress_bilateral', null, [[80, 6]], { schonmodus: true })],
      [deload, makeSets(deload, 'legpress_bilateral', null, [[100, 6], [100, 6]])],
    )
    expect(recommend(plan, item('lower_a', 'legpress_bilateral'), null, h, { ...normalCtx, programWeek: 6 })).toMatchObject({
      weightKg: 105,
      increased: true,
    })
  })

  it('Deload und Taper: gleiche Last, keine Steigerung', () => {
    const s = makeSession({ date: '2026-09-29' })
    const h = history([s, allTop(s)])
    const press = item('lower_a', 'legpress_bilateral')
    expect(recommend(plan, press, null, h, { ...normalCtx, weekType: 'deload' })).toMatchObject({ weightKg: 100, increased: false })
    expect(recommend(plan, press, null, h, { ...normalCtx, taper: true })).toMatchObject({ weightKg: 100, increased: false })
  })

  it('laufende Einheit zählt nicht als Vorgeschichte', () => {
    const before = makeSession({ date: '2026-09-29' })
    const current = makeSession({ date: '2026-10-06', status: 'active' })
    const h = history([before, allTop(before)], [current, makeSets(current, 'legpress_bilateral', null, [[105, 6]])])
    expect(recommend(plan, item('lower_a', 'legpress_bilateral'), null, h, normalCtx, { currentSessionId: current.id }).weightKg).toBe(105)
  })
})

describe('Technikübungen', () => {
  const squat = item('lower_a', 'squat_barbell') // 6–8, RIR 3–4, +2,5 kg
  const top = (s: SessionLog, kg: number) => makeSets(s, 'squat_barbell', null, [[kg, 8, 3], [kg, 8, 3], [kg, 8, 3]])

  it('steigert nur, wenn die letzte Einheit grün war', () => {
    const green = makeSession({ date: '2026-09-29' })
    const yellow = makeSession({ date: '2026-09-29', kneeStatus: 'yellow' })
    expect(recommend(plan, squat, null, history([green, top(green, 60)]), normalCtx)).toMatchObject({ weightKg: 62.5, increased: true })
    expect(recommend(plan, squat, null, history([yellow, top(yellow, 60)]), normalCtx)).toMatchObject({ weightKg: 60, increased: false })
  })

  it('höchstens +5 kg pro Programmwoche', () => {
    const w2 = makeSession({ date: '2026-09-29', programWeek: 2 })
    const w3a = makeSession({ date: '2026-10-05', programWeek: 3 })
    const w3b = makeSession({ date: '2026-10-07', programWeek: 3 })
    const h = history([w2, top(w2, 60)], [w3a, top(w3a, 62.5)], [w3b, top(w3b, 65)])
    expect(recommend(plan, squat, null, h, { ...normalCtx, programWeek: 3 })).toMatchObject({ weightKg: 65, increased: false })
    expect(recommend(plan, squat, null, h, { ...normalCtx, programWeek: 4 })).toMatchObject({ weightKg: 67.5, increased: true })
  })
})

describe('Manuell und ohne Last', () => {
  it('manual: keine Empfehlung, letzte Werte vorbelegt', () => {
    const iso = item('upper_a', 'knee_iso_legext')
    const s = makeSession({ date: '2026-09-29' })
    const sets = makeSets(s, 'knee_iso_legext', 'R', [[20, 0]], { reps: null, seconds: 45 })
    const rec = recommend(plan, iso, 'R', history([s, sets]), normalCtx)
    expect(rec.kind).toBe('manual')
    expect(rec.prefill).toMatchObject({ weightKg: 20, seconds: 45 })
    expect(recommend(plan, iso, 'L', history([s, sets]), normalCtx).prefill.weightKg).toBeNull()
  })

  it('manual mit defaultWeightKg', () => {
    const jc = item('upper_b', 'jefferson_curl_kb')
    expect(recommend(plan, jc, null, history(), normalCtx).prefill.weightKg).toBe(8)
  })

  it('reine Wiederholungsübungen haben keine Lastempfehlung', () => {
    expect(recommend(plan, item('lower_a', 'deadbug_legs'), null, history(), normalCtx)).toMatchObject({
      kind: 'none',
      prefill: { reps: 8, weightKg: null },
    })
  })
})
