import { useEffect } from 'react'
import type { Plan } from '../domain/plan'
import { playCue } from '../platform/audio'
import { speak } from '../platform/voice'
import type { Derived } from '../state/derived'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { Button, Dialog, JarvisLine } from '../ui/controls'
import { useLine } from '../ui/useLine'
import { formatDateDe } from '../domain/dates'
import styles from './Overlays.module.css'

/** OP-Datum erreicht: einmalige Frage „OP erfolgt?“. */
export function OpDoneDialog({ plan, derived }: { plan: Plan; derived: Derived }) {
  const settings = useApp((st) => st.settings)
  const today = useApp((st) => st.today)
  const updateSettings = useApp((st) => st.updateSettings)
  const setTab = useUi((u) => u.setTab)
  if (!derived.ctx.askOpDone || !settings.opDate) return null

  return (
    <Dialog
      title="OP erfolgt?"
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => void updateSettings({ repairMode: true, repairSince: today, repairPhaseId: plan.phase.id, opAskedFor: settings.opDate })}
          >
            Ja, die OP ist erfolgt
          </Button>
          <Button
            onClick={() => {
              void updateSettings({ opAskedFor: settings.opDate })
              setTab('system')
            }}
          >
            Nein, Termin ändern
          </Button>
        </>
      }
    >
      <p>Der OP-Termin vom {formatDateDe(settings.opDate)} ist erreicht.</p>
      <p>Mit „Ja“ startet der Reparaturmodus: keine Missionen, keine Mahnungen, Mark und Punkte bleiben erhalten.</p>
    </Dialog>
  )
}

/** Stufenaufstieg: der eine größere Moment außerhalb des Starts. */
export function MarkUpOverlay() {
  const markUp = useUi((u) => u.markUp)
  const setMarkUp = useUi((u) => u.setMarkUp)
  const line = useLine(markUp ? 'markUp' : null, { mark: markUp?.name ?? '' })

  useEffect(() => {
    if (!line) return
    playCue('markUp')
    speak(line)
  }, [line])

  if (!markUp) return null

  return (
    <div className={styles.markUp} role="alertdialog" aria-modal="true" aria-label={`${markUp.name} erreicht`}>
      <svg className={styles.rings} viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="140" className={styles.ringA} />
        <circle cx="150" cy="150" r="118" className={styles.ringB} />
        <circle cx="150" cy="150" r="96" className={styles.ringC} />
      </svg>
      <div className={styles.markBody}>
        <p className={styles.markKicker}>Upgrade</p>
        <p className={styles.markName}>{markUp.name}</p>
        <p className={styles.markTitle}>{markUp.title}</p>
        <JarvisLine text={line} />
      </div>
      <div className={styles.markAction}>
        <Button variant="primary" block onClick={() => setMarkUp(null)}>
          Weiter
        </Button>
      </div>
    </div>
  )
}
