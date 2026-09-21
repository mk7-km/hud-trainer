import { describe, expect, it } from 'vitest'
import { deriveKnee, isKneeCheckComplete } from './knee'
import { parsePlan } from './plan'
import { resolveSession } from './sessionPlan'
import { loadTestPlan, rawPlan } from './testplan.node'

const plan = loadTestPlan()
const normal = { weekType: 'normal', taper: false, block: 1 } as const
const ok = { swelling: 'keine', pain: 0, stiffness: 'nein', givingWay48h: 'nein', locking: 'nein' }
const ids = (s: ReturnType<typeof resolveSession>) => s.items.map((i) => i.exerciseId)

describe('Plan-Schema', () => {
  it('akzeptiert den freigegebenen Plan', () => {
    expect(parsePlan(rawPlan()).ok).toBe(true)
  })
  it('lehnt unbekannte Übungsverweise ab', () => {
    const raw = rawPlan() as { sessions: { items: { exerciseId?: string }[] }[] }
    raw.sessions[0]!.items[0]!.exerciseId = 'gibt_es_nicht'
    const res = parsePlan(raw)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join()).toContain('gibt_es_nicht')
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
    expect(s.plannedUnits).toBe(26) // 3+3+6+6+2+3+2 Sätze + 1 Checkliste
    expect(s.items.find((i) => i.exerciseId === 'legpress_single')!.sides).toEqual([
      { side: 'R', sets: 3 },
      { side: 'L', sets: 3 },
    ])
  })

  it('Gelb: streicht skip-Übungen, reduziert reduce20, lässt keep unverändert', () => {
    const s = resolveSession(plan, 'lower_b', normal, 'yellow')
    expect(ids(s)).not.toContain('jump_bilateral_band')
    expect(ids(s)).not.toContain('lunge')
    expect(ids(s)).not.toContain('stepdown_lateral')
    expect(s.removed.map((r) => r.reason)).toEqual(['yellow', 'yellow', 'yellow'])
    const deadlift = s.items.find((i) => i.exerciseId === 'deadlift')!
    expect(deadlift).toMatchObject({ loadFactor: 0.8, schonmodus: true })
    const bridge = s.items.find((i) => i.exerciseId === 'bridge')!
    expect(bridge).toMatchObject({ loadFactor: 1, schonmodus: false })
    expect(s.plannedUnits).toBe(3 + 6 + 6 + 3 + 2 + 1)
  })

  it('Rot: setzt Unterkörper aus', () => {
    const s = resolveSession(plan, 'lower_a', normal, 'red')
    expect(s.suspended).toBe(true)
    expect(s.items).toEqual([])
  })

  it('Rot: Oberkörper ohne kniebelastende Übungen', () => {
    const s = resolveSession(plan, 'upper_a', normal, 'red')
    expect(s.suspended).toBe(false)
    expect(ids(s)).not.toContain('knee_iso_legext')
    expect(ids(s)).not.toContain('calf_raise_stepper')
    expect(ids(s)).toContain('bench_press')
  })

  it('Rot: Bonuseinheit nur Mobility', () => {
    const s = resolveSession(plan, 'bonus_swim_bike', normal, 'red')
    expect(ids(s)).toEqual(['mobility_block'])
    expect(s.plannedUnits).toBe(1)
  })

  it('Taper: Impact-Übungen entfallen, halbe Sätze', () => {
    const s = resolveSession(plan, 'lower_b', { ...normal, taper: true }, 'green')
    expect(ids(s)).not.toContain('jump_bilateral_band')
    expect(s.removed).toEqual([expect.objectContaining({ reason: 'taper' })])
    expect(s.items.find((i) => i.exerciseId === 'deadlift')!.sides[0]!.sets).toBe(2)
  })

  it('setsBySide: Kalibrierung und Deload je Seite', () => {
    const iso = (weekType: 'calibration' | 'deload' | 'normal') =>
      resolveSession(plan, 'upper_a', { ...normal, weekType }, 'green').items.find(
        (i) => i.exerciseId === 'knee_iso_legext',
      )!.sides
    expect(iso('normal')).toEqual([{ side: 'R', sets: 4 }, { side: 'L', sets: 2 }])
    expect(iso('calibration')).toEqual([{ side: 'R', sets: 2 }, { side: 'L', sets: 2 }])
    expect(iso('deload')).toEqual([{ side: 'R', sets: 2 }, { side: 'L', sets: 1 }])
  })

  it('Kalibrierung: Ziel-RIR aus calibration.targetRIR', () => {
    const s = resolveSession(plan, 'upper_a', { ...normal, weekType: 'calibration' }, 'green')
    expect(s.items.find((i) => i.exerciseId === 'bench_press')!.targetRIR).toEqual([3, 3])
  })

  it('Item-Overrides und Supersätze', () => {
    const s = resolveSession(plan, 'upper_b', normal, 'green')
    const raise = s.items.find((i) => i.exerciseId === 'lateral_raise')!
    expect(raise.sides[0]!.sets).toBe(2)
    expect(raise.supersetGroup).toBe('shoulder')
    expect(resolveSession(plan, 'upper_a', normal, 'green').items.find((i) => i.exerciseId === 'lateral_raise')!.sides[0]!.sets).toBe(3)
  })

  it('Varianten je Block überschreiben Felder', () => {
    const b1 = resolveSession(plan, 'lower_b', normal, 'green')
    const b2 = resolveSession(plan, 'lower_b', { ...normal, block: 2 }, 'green')
    expect(b1.items.find((i) => i.exerciseId === 'lunge')).toMatchObject({ variantId: 'static', tempo: '5-2-2' })
    expect(b2.items.find((i) => i.exerciseId === 'lunge')).toMatchObject({ variantId: 'dynamic_reverse', tempo: '2-0-1' })
    expect(b1.items.find((i) => i.exerciseId === 'bridge')!.sides.map((s) => s.side)).toEqual(['R', 'L'])
    expect(b2.items.find((i) => i.exerciseId === 'bridge')!.sides.map((s) => s.side)).toEqual([null])
    expect(b2.items.find((i) => i.exerciseId === 'bridge')!.reps).toEqual([8, 12])
  })

  it('chooseOne: offene Wahl, danach gewählte Übung mit Variante', () => {
    const open = resolveSession(plan, 'bonus_swim_bike', { ...normal, block: 2 }, 'green')
    expect(open.items[0]!.options?.map((o) => o.exerciseId)).toEqual(['swim_crawl', 'bike_saturday'])
    const chosen = resolveSession(plan, 'bonus_swim_bike', { ...normal, block: 2 }, 'green', { '0': 'bike_saturday' })
    expect(chosen.items[0]).toMatchObject({ exerciseId: 'bike_saturday', variantId: 'intervals', minutes: [35, 45], options: null })
    expect(chosen.plannedUnits).toBe(2)
  })
})
