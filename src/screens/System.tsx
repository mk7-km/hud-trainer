import { say } from '../content/jarvis'
import { formatDateDe } from '../domain/dates'
import type { Plan } from '../domain/plan'
import { useOfflineReady } from '../platform/offline'
import { requestPersistence } from '../platform/share'
import { isStandalone } from '../platform/standalone'
import { useApp } from '../state/store'
import { BackupPanel } from '../ui/BackupPanel'
import { Button, Panel } from '../ui/controls'
import { InstallHint } from './Onboarding'
import s from './screen.module.css'
import m from './mission/mission.module.css'

export function System({ plan }: { plan: Plan | null }) {
  const settings = useApp((st) => st.settings)
  const planError = useApp((st) => st.planError)
  const updateSettings = useApp((st) => st.updateSettings)
  const reload = useApp((st) => st.reload)
  const offlineReady = useOfflineReady()
  const standalone = isStandalone()
  const persist = settings.persistGranted

  return (
    <main className={s.scroll}>
      <p className={s.kicker}>System</p>
      <h1 className={s.h1}>Einstellungen und Daten</h1>

      {planError && (
        <Panel tone="alarm" title="Trainingsplan">
          <p className={s.text}>{planError}</p>
        </Panel>
      )}

      <Panel title="Status">
        <Row label="App-Version" value={__APP_VERSION__} />
        <Row label="Trainingsplan" value={plan ? `Version ${plan.planVersion}` : 'nicht geladen'} />
        <Row label="Programmstart" value={settings.programStart ? formatDateDe(settings.programStart) : 'offen'} />
        <Row label="OP-Termin" value={settings.opDate ? formatDateDe(settings.opDate) : 'offen'} />
        <Row label="Startmodus" value={standalone ? 'Vollbild' : 'Browser'} />
        <Row label="Offline" value={offlineReady ? 'bereit' : 'wird vorbereitet …'} />
        <Row label="Speicherschutz" value={persist === true ? 'aktiv' : persist === false ? 'nicht bestätigt' : 'nicht angefragt'} />
      </Panel>

      <Panel title="Datensicherung">
        <div className={s.stack}>
          {persist !== true && (
            <Button onClick={() => void requestPersistence().then((granted) => updateSettings({ persistGranted: granted }))}>
              Speicherschutz anfragen
            </Button>
          )}
          {persist === false && <p className={s.warn}>{say('storageWarning')}</p>}
          <BackupPanel planVersion={plan?.planVersion ?? null} lastBackupAt={settings.lastBackupAt} onChanged={() => void reload()} />
        </div>
      </Panel>

      {!standalone && (
        <Panel title="Zum Home-Bildschirm hinzufügen" tone="warn">
          <InstallHint />
        </Panel>
      )}
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={m.statRow}>
      <span className={m.statLabel}>{label}</span>
      <span className="num">{value}</span>
    </div>
  )
}
