import { describe, expect, it } from 'vitest'
import { deriveKnee, isKneeCheckComplete } from './knee'
import { parsePlan, rulesOf, spacingRules, type Plan, type PlanExercise } from './plan'
import { resolveSession } from './sessionPlan'
import { loadTestPlan, rawPlan } from './testplan.node'

const plan = loadTestPlan()
const normal = { weekType: 'normal', taper: false, block: 1 } as const
const ok = { swelling: 'keine', pain: 0, stiffness: 'nein', givingWay48h: 'nein', locking: 'nein' }
const ids = (s: ReturnType<typeof resolveSession>) => s.items.map((i) => i.exerciseId)

/** Plan mit einer veränderten Übung (für Fälle, die der freigegebene Plan nicht enthält). */
const withExercise = (id: string, patch: Partial<PlanExercise>): Plan => ({
  ...plan,
  exercises: { ...plan.exercises, [id]: { ...plan.exercises[id]!, ...patch } },
})

describe('Plan-Schema', () => {
  it('akzeptiert den freigegebenen Plan samt Freigabe-Hinweis und Abstandsregeln', () => {
    const res = parsePlan(rawPlan())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.plan.planVersion).toBe('1.1.0')
    expect(res.plan.approval?.changesReviewedByPhysio).toBe(false)
    expect(spacingRules(res.plan).map((r) => r.id)).toEqual(['lower_48h', 'core_lower_a'])
    expect(res.plan.schedule.recommendedOrder).toEqual(['lower_a', 'upper', 'lower_b', 'core'])
  })
  it('leitet die Punkteregeln ab; entfallene Bonuswerte sind 0', () => {
    expect(rulesOf(plan)).toMatchObject({ planVersion: '1.1.0', pflichtPerWeek: 4, bonusPerWeek: 0, pflichtSession: 100, bonusSession: 0, weekAllPflicht: 200, perfectWeekExtra: 0 })
  })
  it('übersetzt die feste 48-Stunden-Regel eines Plans 1.0 in eine Abstandsregel', () => {
    const raw = rawPlan() as { schedule: Record<string, unknown> }
    delete raw.schedule.spacingRules
    raw.schedule.minHoursBetweenLowerSessions = 48
    const res = parsePlan(raw)
    expect(res.ok).toBe(true)
    if (res.ok) expect(spacingRules(res.plan)).toEqual([expect.objectContaining({ sessions: ['lower_a', 'lower_b'], minHours: 48 })])
  })
  it('lehnt unbekannte Verweise ab', () => {
    const raw = rawPlan() as { sessions: { items: { exerciseId?: string }[] }[]; schedule: { spacingRules: { sessions: string[] }[] } }
    raw.sessions[0]!.items[0]!.exerciseId = 'gibt_es_nicht'
    const res = parsePlan(raw)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join()).toContain('gibt_es_nicht')
    const raw2 = rawPlan() as typeof raw
    raw2.schedule.spacingRules[0]!.sessions = ['lower_a', 'bonus_x']
    expect(parsePlan(raw2).ok).toBe(false)
  })
  it('lehnt fehlende Ampel-Fragen und kaputte Dateien ab', () => {
    const raw = rawPlan() as { kneeCheck: { questions: unknown[] } }
    raw.kneeCheck.questions.pop()
    expect(parsePlan(raw).ok).toBe(false)
    expect(parsePlan({}).ok).toBe(false)
    expect(parsePlan(null).ok).toBe(false)
  })
})

describe('Ampel-Ableitung', () => {
  const status = (a: object) => deriveKnee(plan, { ...ok, ...a }).status
  it('grün ohne Auffälligkeiten, Schmerz bis 2', () => {
    expect(status({})).toBe('green')
    expect(status({ pain: 2 })).toBe('green')
  })
  it('gelb bei leichter Schwellung, Schmerz 3–4 oder Morgensteifigkeit', () => {
    expect(status({ swelling: 'leicht' })).toBe('yellow')
    expect(status({ pain: 3 })).toBe('yellow')
    expect(status({ pain: 4 })).toBe('yellow')
    expect(status({ stiffness: 'ja' })).toBe('yellow')
  })
  it('rot bei deutlicher Schwellung, Schmerz ab 5, Wegknicken oder Blockade', () => {
    expect(status({ swelling: 'deutlich' })).toBe('red')
    expect(status({ pain: 5 })).toBe('red')
    expect(status({ givingWay48h: 'ja' })).toBe('red')
    expect(status({ locking: 'ja', stiffness: 'ja' })).toBe('red')
  })
  it('meldet Ereignisse', () => {
    expect(deriveKnee(plan, { ...ok, givingWay48h: 'ja' })).toMatchObject({ givingWay: true, locking: false })
    expect(deriveKnee(plan, { ...ok, locking: 'ja' })).toMatchObject({ givingWay: false, locking: true })
  })
  it('verlangt alle Antworten', () => {
    expect(isKneeCheckComplete(plan, ok)).toBe(true)
    expect(isKneeCheckComplete(plan, { ...ok, pain: undefined as unknown as number })).toBe(false)
  })
})

describe('Einheit auflösen', () => {
  it('zählt geplante Einheiten bei Grün', () => {
    const s = resolveSession(plan, 'lower_a', normal, 'green')
    expect(s.plannedUnits).toBe(25) // 3+3+6+6+6 Sätze + 1 Checkliste
    expect(s.items.find((i) => i.exerciseId === 'legpress_single')!.sides).toEqual([
      { side: 'R', sets: 3 },
      { side: 'L', sets: 3 },
    ])
  })

  it('Gelb: streicht skip-Übungen, reduziert reduce20, lässt keep unverändert', () => {
    const s = resolveSession(plan, 'lower_b', normal, 'yellow')
    expect(ids(s)).not.toContain('jump_bilateral_band')
    expect(ids(s)).not.toContain('lunge')
    expect(s.removed.map((r) => r.reason)).toEqual(['yellow', 'yellow'])
    expect(s.items.find((i) => i.exerciseId === 'legpress_bilateral')).toMatchObject({ loadFactor: 0.8, schonmodus: true })
    expect(s.items.find((i) => i.exerciseId === 'calf_raise_stepper')).toMatchObject({ loadFactor: 1, schonmodus: false })
    expect(s.plannedUnits).toBe(3 + 3 + 2 + 3 + 1)
  })

  it('Rot: setzt Unterkörper aus', () => {
    const s = resolveSession(plan, 'lower_a', normal, 'red')
    expect(s.suspended).toBe(true)
    expect(s.items).toEqual([])
  })

  it('Rot: Oberkörper und Rumpf laufen, kniebelastende Übungen entfallen', () => {
    const upper = resolveSession(plan, 'upper', normal, 'red')
    expect(upper.suspended).toBe(false)
    expect(ids(upper)).toContain('bench_press')
    const core = resolveSession(plan, 'core', normal, 'red')
    expect(core.suspended).toBe(false)
    expect(core.items).toHaveLength(plan.sessions.find((t) => t.id === 'core')!.items.length)
    // kniebelastende Übung in einer Nicht-Unterkörper-Einheit entfällt
    const p2 = withExercise('back_extension_45', { kneeLoad: 'low', red: 'skip' })
    expect(ids(resolveSession(p2, 'core', normal, 'red'))).not.toContain('back_extension_45')
  })

  it('Taper: Impact-Übungen entfallen, halbe Sätze', () => {
    const s = resolveSession(plan, 'lower_b', { ...normal, taper: true }, 'green')
    expect(ids(s)).not.toContain('jump_bilateral_band')
    expect(s.removed).toEqual([expect.objectContaining({ reason: 'taper' })])
    expect(s.items.find((i) => i.exerciseId === 'legpress_bilateral')!.sides[0]!.sets).toBe(2)
  })

  it('setsBySide: Kalibrierung und Deload je Seite', () => {
    const p2 = withExercise('calf_raise_stepper', { unilateral: true, setsBySide: { R: 4, L: 2 } })
    const sides = (weekType: 'calibration' | 'deload' | 'normal') =>
      resolveSession(p2, 'lower_b', { ...normal, weekType }, 'green').items.find((i) => i.exerciseId === 'calf_raise_stepper')!.sides
    expect(sides('normal')).toEqual([{ side: 'R', sets: 4 }, { side: 'L', sets: 2 }])
    expect(sides('calibration')).toEqual([{ side: 'R', sets: 2 }, { side: 'L', sets: 2 }])
    expect(sides('deload')).toEqual([{ side: 'R', sets: 2 }, { side: 'L', sets: 1 }])
  })

  it('Kalibrierung: Ziel-RIR aus calibration.targetRIR', () => {
    const s = resolveSession(plan, 'upper', { ...normal, weekType: 'calibration' }, 'green')
    expect(s.items.find((i) => i.exerciseId === 'bench_press')!.targetRIR).toEqual([3, 3])
  })

  it('Item-Overrides und Supersätze', () => {
    const p2: Plan = {
      ...plan,
      sessions: plan.sessions.map((t) =>
        t.id === 'upper' ? { ...t, items: t.items.map((it) => (it.exerciseId === 'lateral_raise' ? { ...it, overrides: { sets: 2 } } : it)) } : t,
      ),
    }
    expect(resolveSession(p2, 'upper', normal, 'green').items.find((i) => i.exerciseId === 'lateral_raise')!.sides[0]!.sets).toBe(2)
    const s = resolveSession(plan, 'upper', normal, 'green')
    expect(s.items.find((i) => i.exerciseId === 'lateral_raise')!.sides[0]!.sets).toBe(4)
    expect(s.items.find((i) => i.exerciseId === 'ez_curl')!.supersetGroup).toBe('arms')
  })

  it('Varianten je Block überschreiben Felder', () => {
    const b1 = resolveSession(plan, 'lower_b', normal, 'green')
    const b2 = resolveSession(plan, 'lower_b', { ...normal, block: 2 }, 'green')
    expect(b1.items.find((i) => i.exerciseId === 'lunge')).toMatchObject({ variantId: 'static', tempo: '5-2-2' })
    expect(b2.items.find((i) => i.exerciseId === 'lunge')).toMatchObject({ variantId: 'dynamic_reverse', tempo: '2-0-1' })
    expect(resolveSession(plan, 'lower_a', normal, 'green').items[0]).toMatchObject({ exerciseId: 'squat_barbell', variantId: 'hip_width' })
    expect(resolveSession(plan, 'lower_a', { ...normal, block: 2 }, 'green').items[0]).toMatchObject({ variantId: 'pelvis_width' })
  })

  it('chooseOne: offene Wahl, danach gewählte Übung', () => {
    const p2: Plan = {
      ...plan,
      sessions: plan.sessions.map((t) =>
        t.id === 'upper' ? { ...t, items: [{ chooseOne: ['bench_press', 'incline_db_press'] }, ...t.items.slice(1)] } : t,
      ),
    }
    const open = resolveSession(p2, 'upper', normal, 'green')
    expect(open.items[0]!.options?.map((o) => o.exerciseId)).toEqual(['bench_press', 'incline_db_press'])
    const chosen = resolveSession(p2, 'upper', normal, 'green', { '0': 'incline_db_press' })
    expect(chosen.items[0]).toMatchObject({ exerciseId: 'incline_db_press', options: null })
  })

  it('freeChoice: Name wird vor dem ersten Satz vergeben und ist dann Variante und Anzeigename', () => {
    const idx = plan.sessions.find((t) => t.id === 'upper')!.items.findIndex((it) => it.exerciseId === 'abs_free')
    const before = resolveSession(plan, 'upper', normal, 'green').items.find((i) => i.exerciseId === 'abs_free')!
    expect(before).toMatchObject({ freeChoice: true, freeName: null, name: 'Bauch (freie Wahl)', variantId: null, progression: 'manual' })
    const after = resolveSession(plan, 'upper', normal, 'green', {}, { [String(idx)]: '  Crunch am Kabel ' }).items.find((i) => i.exerciseId === 'abs_free')!
    expect(after).toMatchObject({ freeName: 'Crunch am Kabel', name: 'Crunch am Kabel', variantId: 'Crunch am Kabel', variantLabel: null })
    const empty = resolveSession(plan, 'upper', normal, 'green', {}, { [String(idx)]: '   ' }).items.find((i) => i.exerciseId === 'abs_free')!
    expect(empty.freeName).toBeNull()
    // Rumpf hat dieselbe Übung mit eigenem Namen
    const coreIdx = plan.sessions.find((t) => t.id === 'core')!.items.findIndex((it) => it.exerciseId === 'abs_free')
    expect(resolveSession(plan, 'core', normal, 'green', {}, { [String(coreIdx)]: 'Beinheben' }).items.find((i) => i.exerciseId === 'abs_free')!.variantId).toBe('Beinheben')
  })
})
