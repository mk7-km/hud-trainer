import { say } from '../content/jarvis'
import type { Plan, PlanSession } from '../domain/plan'
import type { SessionLog } from '../domain/types'
import { Button, Dialog } from '../ui/controls'
import { useApp } from './store'
import { useUi } from './ui'

/** Stunden seit der letzten Unterkörper-Einheit, falls unter der Vorgabe des Plans. */
export function lowerTooSoonHours(plan: Plan, sessions: SessionLog[], now: number): number | null {
  const last = lastLowerEnd(sessions)
  if (last === null) return null
  const hours = (now - last) / 3_600_000
  return hours < plan.schedule.minHoursBetweenLowerSessions ? Math.floor(hours) : null
}

export function lastLowerEnd(sessions: SessionLog[]): number | null {
  return sessions
    .filter((x) => x.focus === 'lower' && x.status === 'completed')
    .reduce<number | null>((t, x) => Math.max(t ?? 0, x.endedAt ?? x.startedAt), null)
}

/** Einheit starten; bei zu kurzem Abstand zur letzten Beineinheit erst nach Bestätigung. */
export function requestStart(plan: Plan, template: PlanSession) {
  const hours = template.focus === 'lower' ? lowerTooSoonHours(plan, useApp.getState().sessions, Date.now()) : null
  if (hours !== null) {
    useUi.getState().setTooSoon({ templateId: template.id, hours, line: say('lowerTooSoon', { hours }) })
  } else {
    useUi.getState().openMission({ kind: 'start', templateId: template.id })
  }
}

export function TooSoonDialog({ plan }: { plan: Plan }) {
  const tooSoon = useUi((u) => u.tooSoon)
  const setTooSoon = useUi((u) => u.setTooSoon)
  const openMission = useUi((u) => u.openMission)
  if (!tooSoon) return null
  return (
    <Dialog
      title="Zu früh für die Beine"
      actions={
        <>
          <Button variant="primary" onClick={() => setTooSoon(null)}>
            Andere Einheit wählen
          </Button>
          <Button variant="danger" onClick={() => openMission({ kind: 'start', templateId: tooSoon.templateId })}>
            Trotzdem starten
          </Button>
        </>
      }
    >
      <p>{tooSoon.line}</p>
      <p>
        Zwischen zwei Unterkörper-Einheiten sollen {plan.schedule.minHoursBetweenLowerSessions} Stunden liegen. Seit der
        letzten sind es {tooSoon.hours}.
      </p>
    </Dialog>
  )
}
