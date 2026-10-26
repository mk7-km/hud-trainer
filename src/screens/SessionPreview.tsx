import { useMemo } from 'react'
import { formatDateDe } from '../domain/dates'
import type { Plan } from '../domain/plan'
import { recommend } from '../domain/progression'
import { historyKey, resolveSession, type ResolvedItem } from '../domain/sessionPlan'
import type { Derived } from '../state/derived'
import { freeNameSuggestions } from '../state/mission'
import { conflictHint, conflictsFor, requestStart } from '../state/start'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Button, Panel } from '../ui/controls'
import { formatKg } from '../ui/format'
import { prescription, recommendationText } from './mission/Work'
import s from './screen.module.css'
import m from './mission/mission.module.css'

const SIDE = { R: 'R', L: 'L' } as const

/** Lesbare Vorschau einer Einheit: Übungen, Vorgaben, letzte Werte und Empfehlung. Jederzeit erreichbar. */
export function SessionPreview({ plan, derived, templateId }: { plan: Plan; derived: Derived; templateId: string }) {
  const sessions = useApp((st) => st.sessions)
  const sets = useApp((st) => st.sets)
  const settings = useApp((st) => st.settings)
  const setPreview = useUi((u) => u.setPreview)
  const template = plan.sessions.find((t) => t.id === templateId)
  const active = sessions.find((x) => x.status === 'active') ?? null
  const { ctx } = derived

  const resolved = useMemo(() => (template ? resolveSession(plan, template.id, ctx, 'green') : null), [plan, template, ctx])
  const sessionsById = useMemo(() => new Map(sessions.map((x) => [x.id, x])), [sessions])

  if (!template || !resolved) return null
  const conflicts = conflictsFor(plan, template.id)
  const done = derived.week.fulfilled.has(template.id)
  const canStart = !active && !ctx.locked && !done

  const lastValues = (item: ResolvedItem) => {
    const key = historyKey(item.exerciseId, item.variantId)
    const own = sets.filter((x) => historyKey(x.exerciseId, x.variantId) === key)
    const history = { sets: own, sessionsById }
    const sides = item.logType === 'duration' ? [{ side: null, sets: 1 }] : item.sides
    return sides.map((sd) => {
      const rec = recommend(plan, item, sd.side, history, ctx, { incrementOverride: settings.incrementOverrides[item.exerciseId] })
      const last = own
        .filter((x) => x.side === sd.side && !x.schonmodus)
        .sort((a, b) => b.loggedAt - a.loggedAt)
      const lastSession = last[0]?.sessionId
      const lastSets = last.filter((x) => x.sessionId === lastSession).sort((a, b) => a.setIndex - b.setIndex)
      const text = lastSets.length
        ? `${formatDateDe(lastSets[0]!.date).slice(0, 6)}: ${lastSets
            .map((x) => (x.weightKg !== null ? `${formatKg(x.weightKg)} × ${x.seconds ?? x.reps}` : x.seconds !== null ? `${Math.round(x.seconds / 60)} min` : String(x.reps)))
            .join(' · ')}`
        : null
      return { side: sd.side, last: text, rec: recommendationText(item, rec) }
    })
  }

  return (
    <main className={s.scroll}>
      <div className={s.rowBetween}>
        <div>
          <p className={s.kicker}>Vorschau</p>
          <h1 className={s.h1}>{template.name}</h1>
        </div>
        <Button variant="quiet" onClick={() => setPreview(null)}>
          Schließen
        </Button>
      </div>
      <p className={s.muted}>
        {template.durationMin ? `ca. ${template.durationMin} min · ` : ''}
        Woche {Math.max(ctx.programWeek, 0)} · Block {ctx.block}
        {resolved.removed.length ? ` · heute ohne ${resolved.removed.map((r) => r.name).join(', ')}` : ''}
      </p>

      {template.warmup.length > 0 && (
        <Panel title="Aufwärmen">
          <ul className={s.list} style={{ paddingLeft: 18, listStyle: 'disc' }}>
            {template.warmup.map((w) => (
              <li key={w} className={s.muted} style={{ padding: '4px 0' }}>
                {w}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Übungen">
        <ul className={s.list}>
          {resolved.items.map((item) => (
            <li key={item.index} className={s.listBtn} style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
              <span className={s.listMain}>
                <span>
                  {item.name}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                </span>
                {prescription(item) && <span className={`${s.listSub} num`}>{prescription(item)}</span>}
                {item.hint && <span className={s.listSub}>{item.hint}</span>}
              </span>
              {item.logType !== 'checklist' && !item.freeChoice && (
                <span className={s.listMain} style={{ marginTop: 4 }}>
                  {lastValues(item).map((v, i) => (
                    <span key={i} className={`${s.listSub} num`} style={{ color: 'var(--text)' }}>
                      {v.side ? `${SIDE[v.side]} · ` : ''}
                      {v.last ? `Zuletzt ${v.last}` : 'Noch nicht protokolliert'}
                      {v.rec ? ` · ${v.rec}` : ''}
                    </span>
                  ))}
                </span>
              )}
              {item.freeChoice && (
                <span className={s.listSub} style={{ marginTop: 4 }}>
                  {freeNameSuggestions(sets, item.exerciseId).length
                    ? `Zuletzt: ${freeNameSuggestions(sets, item.exerciseId).slice(0, 3).join(', ')}`
                    : 'Name wird in der Einheit eingegeben'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {conflicts.map((c) => (
        <p key={c.rule.id} className={s.warn}>
          {c.rule.text ?? ''} {conflictHint(c)}.
        </p>
      ))}
      {active && <p className={s.muted}>Zuerst die laufende Einheit „{active.sessionName}“ beenden.</p>}
      {done && <p className={s.muted}>Diese Woche bereits erledigt.</p>}
      {canStart && (
        <Button variant="primary" block onClick={() => requestStart(plan, template)}>
          Einheit starten
        </Button>
      )}
      <div className={m.restSpacer} />
    </main>
  )
}
