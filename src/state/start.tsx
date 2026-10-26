import { say } from '../content/jarvis'
import { formatDateDe } from '../domain/dates'
import type { Plan, PlanSession } from '../domain/plan'
import { conflictLineKey, spacingConflicts, type SpacingConflict } from '../domain/spacing'
import { Button, Dialog } from '../ui/controls'
import { useApp } from './store'
import { useUi } from './ui'

/** Verstöße gegen die Abstandsregeln, wenn `templateId` jetzt gestartet würde. */
export function conflictsFor(plan: Plan, templateId: string): SpacingConflict[] {
  const { sessions, today } = useApp.getState()
  return spacingConflicts(plan, sessions, templateId, Date.now(), today)
}

/** Kurztext für Listen: ab wann bzw. warum eine Einheit warten sollte. */
export function conflictHint(c: SpacingConflict): string {
  if (c.kind === 'minHours' && c.freeAt !== undefined) {
    const at = new Date(c.freeAt)
    return `frühestens ${at.toLocaleDateString('de-AT', { weekday: 'short' })} ${at.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
  }
  return `nicht direkt nach ${c.otherName} (${formatDateDe(c.otherDate ?? '').slice(0, 6)})`
}

/** Einheit starten; bei verletzter Abstandsregel erst nach Bestätigung. */
export function requestStart(plan: Plan, template: PlanSession) {
  const conflicts = conflictsFor(plan, template.id)
  if (conflicts.length) {
    useUi.getState().setTooSoon({
      templateId: template.id,
      conflicts: conflicts.map((c) => ({
        line: say(conflictLineKey(c), { hours: c.hours ?? 0 }),
        text: c.rule.text ?? '',
      })),
    })
  } else {
    useUi.getState().openMission({ kind: 'start', templateId: template.id })
  }
}

export function TooSoonDialog() {
  const tooSoon = useUi((u) => u.tooSoon)
  const setTooSoon = useUi((u) => u.setTooSoon)
  const openMission = useUi((u) => u.openMission)
  if (!tooSoon) return null
  return (
    <Dialog
      title="Abstandsregel"
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
      {tooSoon.conflicts.map((c, i) => (
        <div key={i}>
          <p>„{c.line}“</p>
          {c.text && <p>{c.text}</p>}
        </div>
      ))}
    </Dialog>
  )
}
