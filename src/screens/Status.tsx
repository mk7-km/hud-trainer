import { useMemo, useState, type ReactNode } from 'react'
import { say } from '../content/jarvis'
import { average7, losingTooFast, weeklyTrend, weighInsThisWeek } from '../domain/bodyweight'
import { addDays, diffDays, formatDateDe } from '../domain/dates'
import { exerciseHistory, loggedExercises, strengthTrend } from '../domain/history'
import { evaluateMark, type CriterionResult } from '../domain/marks'
import type { Plan } from '../domain/plan'
import { addWeighIn, deleteWeighIn } from '../state/body'
import type { Derived } from '../state/derived'
import { reportGivingWay } from '../state/mission'
import { useApp } from '../state/store'
import { Button, Dialog, JarvisLine, Panel, Stepper } from '../ui/controls'
import { formatInt, formatKg, formatPct } from '../ui/format'
import { Sparkline } from '../ui/Sparkline'
import s from './screen.module.css'
import m from './mission/mission.module.css'

const short = (d: string) => formatDateDe(d).slice(0, 6)
const kg1 = (n: number) => formatKg(Math.round(n * 10) / 10)
const signedPct = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(Math.round(r * 100))} %`

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={m.statRow}>
      <span className={m.statLabel}>{label}</span>
      <span className="num">{children}</span>
    </div>
  )
}

function criterionLabel(r: CriterionResult): { label: string; value: string } {
  const c = r.criterion
  const pct = (n: number | null) => (n === null ? '–' : formatPct(n))
  switch (c.type) {
    case 'fullWeeksTotalMin':
      return { label: 'Volle Wochen gesamt', value: `${r.actual ?? 0} / ${c.value}` }
    case 'fullWeeksInRowMin':
      return { label: 'Volle Wochen in Folge', value: `${r.actual ?? 0} / ${c.value}` }
    case 'rightGainMin':
      return { label: 'Zuwachs rechts', value: `${r.actual === null ? '–' : signedPct(r.actual)} / +${Math.round(c.value * 100)} %` }
    case 'symmetryMin':
      return { label: 'Symmetrie', value: `${pct(r.actual)} / ${pct(c.value)}` }
    case 'calmDaysMin':
      return { label: 'Ruhige Knie-Tage', value: `${r.actual ?? 0} / ${c.value}` }
    case 'baselineCaptured':
      return { label: 'Baseline beider Beine erfasst', value: r.ok ? 'ja' : 'offen' }
    case 'selfCheck':
      return { label: c.text, value: r.ok ? 'bestätigt' : 'offen' }
  }
}

function MarkPanel({ plan, derived }: { plan: Plan; derived: Derived }) {
  const today = useApp((st) => st.today)
  const selfChecks = useApp((st) => st.settings.selfChecks)
  const updateSettings = useApp((st) => st.updateSettings)
  const current = plan.marks.find((x) => x.level === derived.reachedLevel)
  const next = plan.marks.find((x) => x.level === derived.reachedLevel + 1)
  const results = next ? evaluateMark(plan, next.level, derived.facts) : []

  return (
    <Panel title="Mark-Stufe" tone="active">
      <p className={m.big}>{current ? current.name : 'Mark 0'}</p>
      <p className={s.muted}>{current ? current.title : 'Noch nicht kalibriert'}</p>
      {next ? (
        <>
          <p className={s.kicker} style={{ marginTop: 14 }}>
            Nächste Stufe: {next.name} · {next.title}
          </p>
          {results.map((r, i) => {
            const { label, value } = criterionLabel(r)
            const c = r.criterion
            return (
              <div key={i} className={m.statRow}>
                <span className={s.listMain}>
                  <span>{label}</span>
                  {c.type === 'selfCheck' && !r.ok && (
                    <Button onClick={() => void updateSettings({ selfChecks: { ...selfChecks, [c.id]: today } })}>Jetzt bestätigen</Button>
                  )}
                </span>
                <span className={`${s.tag} num`} data-state={r.ok ? 'done' : undefined}>
                  {value} {r.ok ? '✓' : ''}
                </span>
              </div>
            )
          })}
        </>
      ) : (
        <p className={s.text}>Höchste Stufe erreicht.</p>
      )}
    </Panel>
  )
}

function StrengthPanel({ plan, derived }: { plan: Plan; derived: Derived }) {
  const sets = useApp((st) => st.sets)
  const sessions = useApp((st) => st.sessions)
  const caveatSeen = useApp((st) => st.settings.symmetryCaveatSeen)
  const updateSettings = useApp((st) => st.updateSettings)
  const trend = useMemo(() => strengthTrend(plan, sets, sessions), [plan, sets, sessions])
  const name = (id: string) => plan.exercises[id]?.name ?? id
  const origin = trend[0]?.date
  const x = (d: string) => (origin ? diffDays(d, origin) : 0)
  const symPoints = trend.filter((t) => t.symmetry !== null).map((t) => ({ x: x(t.date), y: t.symmetry! * 100 }))
  const gainPoints = trend.filter((t) => t.gain !== null).map((t) => ({ x: x(t.date), y: t.gain! * 100 }))
  const groupLabel: Record<string, string> = { quad: 'Strecker', ham: 'Beuger' }

  return (
    <Panel title="Symmetrie und Zuwachs">
      {derived.symmetry.index === null ? (
        <p className={s.muted}>Noch keine Werte beider Seiten im Zeitraum von {plan.symmetry.windowDays} Tagen. Die einbeinigen Übungen in Unterkörper A und B liefern sie.</p>
      ) : (
        <>
          <p className={m.big}>{formatPct(derived.symmetry.index)}</p>
          <p className={s.muted}>Gesamtindex rechts zu links, beste Werte der letzten {plan.symmetry.windowDays} Tage</p>
        </>
      )}
      {!caveatSeen && (
        <div className={s.info}>
          <p className={s.muted}>{plan.symmetry.caveat}</p>
          <Button variant="quiet" onClick={() => void updateSettings({ symmetryCaveatSeen: true })}>
            Verstanden
          </Button>
        </div>
      )}
      {derived.symmetry.rows.map((r) => (
        <div key={r.exerciseId} className={m.statRow}>
          <span className={s.listMain}>
            <span>{name(r.exerciseId)}</span>
            <span className={`${s.listSub} num`}>
              R {r.right === null ? '–' : kg1(r.right)} · L {r.left === null ? '–' : kg1(r.left)} kg e1RM
            </span>
          </span>
          <span className="num">{r.ratio === null ? '–' : formatPct(r.ratio)}</span>
        </div>
      ))}
      {Object.entries(derived.symmetry.groups).map(([g, v]) => (
        <Stat key={g} label={groupLabel[g] ?? g}>
          {v === null ? '–' : formatPct(v)}
        </Stat>
      ))}
      <Stat label="Zuwachs rechts gegenüber Baseline">{derived.gain.gain === null ? '–' : signedPct(derived.gain.gain)}</Stat>
      {derived.gain.rows.map((r) => (
        <div key={r.exerciseId} className={m.statRow}>
          <span className={s.listSub}>{name(r.exerciseId)}</span>
          <span className={`${s.listSub} num`}>
            {r.baseline === null ? 'Baseline offen' : `${kg1(r.baseline)} → ${r.current === null ? '–' : kg1(r.current)} kg`}
          </span>
        </div>
      ))}
      {symPoints.length > 0 && (
        <>
          <p className={s.kicker} style={{ marginTop: 14 }}>
            Verlauf Symmetrie (%)
          </p>
          <Sparkline label="Verlauf der Symmetrie" series={[{ points: symPoints, dots: true }]} yMin={50} yMax={100} guides={[90]} />
        </>
      )}
      {gainPoints.length > 0 && (
        <>
          <p className={s.kicker} style={{ marginTop: 14 }}>
            Verlauf Zuwachs rechts (%)
          </p>
          <Sparkline label="Verlauf des Zuwachses rechts" series={[{ points: gainPoints, dots: true, tone: 'ice' }]} guides={[0]} />
        </>
      )}
    </Panel>
  )
}

function KneePanel({ plan }: { plan: Plan }) {
  const kneeChecks = useApp((st) => st.kneeChecks)
  const kneeEvents = useApp((st) => st.kneeEvents)
  const [confirm, setConfirm] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const checks = [...kneeChecks].sort((a, b) => b.at - a.at).slice(0, 21).reverse()
  const events = [...kneeEvents].sort((a, b) => b.at - a.at)

  return (
    <Panel title="Knie-Protokoll">
      {checks.length === 0 ? (
        <p className={s.muted}>Noch kein Knie-Check. Er kommt vor jeder Einheit.</p>
      ) : (
        <div className={s.dots} role="img" aria-label="Ampelverlauf der letzten Knie-Checks">
          {checks.map((c) => (
            <span key={c.id} className={s.dot} data-knee={c.status} title={formatDateDe(c.date)} />
          ))}
        </div>
      )}
      {events.slice(0, 5).map((e) => (
        <div key={e.id} className={m.statRow}>
          <span>{e.type === 'givingWay' ? 'Wegknicken' : 'Blockade'}</span>
          <span className={`${s.listSub} num`}>
            {formatDateDe(e.date)} · {e.source === 'manual' ? 'gemeldet' : 'Knie-Check'}
          </span>
        </div>
      ))}
      {events.length === 0 && checks.length > 0 && <p className={s.muted}>Keine Wegknick- oder Blockade-Ereignisse.</p>}
      <JarvisLine text={line} />
      <div style={{ marginTop: 12 }}>
        <Button variant="danger" block onClick={() => setConfirm(true)}>
          Wegknicken melden
        </Button>
      </div>
      {confirm && (
        <Dialog
          title="Wegknicken melden"
          actions={
            <>
              <Button
                variant="danger"
                onClick={() => {
                  void reportGivingWay(plan)
                  setLine(say('givingWay'))
                  setConfirm(false)
                }}
              >
                Ereignis speichern
              </Button>
              <Button variant="quiet" onClick={() => setConfirm(false)}>
                Abbrechen
              </Button>
            </>
          }
        >
          <p>{plan.kneeCheck.events.givingWay}</p>
        </Dialog>
      )}
    </Panel>
  )
}

function WeightPanel({ plan }: { plan: Plan }) {
  const entries = useApp((st) => st.bodyweight)
  const today = useApp((st) => st.today)
  const sorted = useMemo(() => [...entries].sort((a, b) => b.at - a.at), [entries])
  const [weight, setWeight] = useState<number | null>(sorted[0]?.weightKg ?? null)
  const [fat, setFat] = useState<number | null>(null)

  const avg = average7(entries, today)
  const trend = weeklyTrend(entries, today)
  const weighIns = weighInsThisWeek(entries, today)
  const origin = addDays(today, -55)
  const recent = entries.filter((e) => e.date >= origin).sort((a, b) => a.at - b.at)
  const raw = recent.map((e) => ({ x: diffDays(e.date, origin), y: e.weightKg }))
  const avgLine = [...new Set(recent.map((e) => e.date))].map((d) => ({ x: diffDays(d, origin), y: average7(entries, d)! }))

  return (
    <Panel title="Körpergewicht">
      {avg !== null && (
        <>
          <p className={m.big}>{kg1(avg)} kg</p>
          <p className={s.muted}>
            7-Tage-Schnitt
            {trend !== null && ` · ${trend <= 0 ? '−' : '+'}${kg1(Math.abs(trend))} kg zur Vorwoche`}
          </p>
        </>
      )}
      {losingTooFast(plan, entries, today) && <p className={s.warn}>{say('weightLossTooFast')}</p>}
      {weighIns < plan.bodyweight.weighInsPerWeekMin && (
        <p className={s.muted}>
          Wägungen diese Woche: {weighIns} von {plan.bodyweight.weighInsPerWeekMin}.
        </p>
      )}
      {raw.length > 1 && (
        <Sparkline
          label="Gewichtsverlauf der letzten acht Wochen"
          series={[
            { points: raw, tone: 'muted', dots: true },
            { points: avgLine, tone: 'primary' },
          ]}
        />
      )}
      <div className={s.stack} style={{ marginTop: 12 }}>
        <Stepper label="Gewicht" unit="kg" value={weight} step={0.1} min={30} max={250} format={formatKg} onChange={setWeight} />
        <Stepper label="Körperfett (optional)" unit="%" value={fat} step={0.5} min={3} max={60} onChange={setFat} />
        <Button
          variant="secondary"
          block
          disabled={weight === null}
          onClick={() => {
            if (weight !== null) void addWeighIn(plan, weight, fat)
            setFat(null)
          }}
        >
          Wägung speichern
        </Button>
      </div>
      {sorted.slice(0, 4).map((e) => (
        <div key={e.id} className={m.statRow}>
          <span className="num">
            {formatDateDe(e.date)} · {formatKg(e.weightKg)} kg{e.fatPct !== null ? ` · ${String(e.fatPct).replace('.', ',')} %` : ''}
          </span>
          <Button variant="quiet" onClick={() => void deleteWeighIn(e.id)} aria-label={`Wägung vom ${formatDateDe(e.date)} löschen`}>
            löschen
          </Button>
        </div>
      ))}
      {plan.bodyweight.proteinHint && <p className={s.muted}>{plan.bodyweight.proteinHint}</p>}
    </Panel>
  )
}

function ExercisePanel() {
  const sets = useApp((st) => st.sets)
  const exercises = useMemo(() => loggedExercises(sets), [sets])
  const [key, setKey] = useState<string>('')
  const selected = exercises.find((e) => e.key === key) ?? exercises[0]
  const days = useMemo(() => (selected ? exerciseHistory(sets, selected.key) : []), [sets, selected])

  if (!selected) {
    return (
      <Panel title="Übungsverlauf">
        <p className={s.muted}>Noch keine Einheit protokolliert. Starte die Kalibrierungswoche.</p>
      </Panel>
    )
  }
  const origin = days[days.length - 1]!.date
  const line = (side: 'R' | 'L' | 'B') =>
    [...days].reverse().filter((d) => d.best[side] !== undefined && !d.schonmodus).map((d) => ({ x: diffDays(d.date, origin), y: d.best[side]! }))

  return (
    <Panel title="Übungsverlauf">
      <label className={s.field}>
        Übung
        <select className={s.input} value={selected.key} onChange={(e) => setKey(e.target.value)}>
          {exercises.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ marginTop: 12 }}>
        <Sparkline
          label="Verlauf des geschätzten Maximums"
          series={[
            { points: line('B'), dots: true },
            { points: line('R'), dots: true },
            { points: line('L'), dots: true, tone: 'muted' },
          ]}
        />
      </div>
      {days.slice(0, 6).map((d) => (
        <div key={d.sessionId} className={m.statRow}>
          <span className={`${s.listSub} num`}>
            {short(d.date)}
            {d.schonmodus ? ' · Schon' : ''}
          </span>
          <span className="num" style={{ textAlign: 'right' }}>
            {(['R', 'L', null] as const)
              .map((side) => {
                const list = d.sets.filter((x) => x.side === side)
                if (!list.length) return null
                const text = list
                  .map((x) => (x.weightKg !== null ? `${formatKg(x.weightKg)}×${x.seconds !== null ? `${x.seconds}s` : x.reps}` : x.seconds !== null ? `${Math.round(x.seconds / 60)} min` : String(x.reps)))
                  .join(' · ')
                return `${side ? side + ' ' : ''}${text}`
              })
              .filter(Boolean)
              .map((t, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {t}
                </span>
              ))}
          </span>
        </div>
      ))}
    </Panel>
  )
}

export function Status({ plan, derived }: { plan: Plan; derived: Derived }) {
  return (
    <main className={s.scroll}>
      <p className={s.kicker}>Status</p>
      <MarkPanel plan={plan} derived={derived} />
      <Panel title="Punkte und Serie">
        <Stat label="Punkte gesamt">{formatInt(derived.points.total)}</Stat>
        <Stat label="Serie (volle Wochen in Folge)">{derived.streak.current}</Stat>
        <Stat label="Längste Serie">{derived.streak.best}</Stat>
        <Stat label="Volle Wochen gesamt">{derived.streak.fullWeeksTotal}</Stat>
      </Panel>
      <StrengthPanel plan={plan} derived={derived} />
      <KneePanel plan={plan} />
      <WeightPanel plan={plan} />
      <ExercisePanel />
    </main>
  )
}
