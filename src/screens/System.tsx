import { useState } from 'react'
import { say } from '../content/jarvis'
import { backupFileName, exportBackup, importBackup, wipeUserData } from '../db/backup'
import { formatDateDe, isDateStr } from '../domain/dates'
import type { Plan } from '../domain/plan'
import { programStartForWeek } from '../domain/schedule'
import { useOfflineReady } from '../platform/offline'
import { requestPersistence, shareJsonFile } from '../platform/share'
import { isStandalone } from '../platform/standalone'
import type { Derived } from '../state/derived'
import { useApp } from '../state/store'
import { BackupPanel } from '../ui/BackupPanel'
import { Button, Dialog, Panel, Seg, Stepper } from '../ui/controls'
import { formatKg } from '../ui/format'
import { InstallHint } from './Onboarding'
import s from './screen.module.css'
import m from './mission/mission.module.css'

const ON_OFF = [
  { value: 'on', label: 'Ein' },
  { value: 'off', label: 'Aus' },
] as const

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.rowBetween} style={{ padding: '6px 0' }}>
      <span>{label}</span>
      <div style={{ width: 132, flex: 'none' }}>
        <Seg label={label} value={value ? 'on' : 'off'} onChange={(v) => onChange(v === 'on')} options={ON_OFF} />
      </div>
    </div>
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

export function System({ plan, derived }: { plan: Plan; derived: Derived }) {
  const settings = useApp((st) => st.settings)
  const today = useApp((st) => st.today)
  const planError = useApp((st) => st.planError)
  const updateSettings = useApp((st) => st.updateSettings)
  const reload = useApp((st) => st.reload)
  const offlineReady = useOfflineReady()
  const standalone = isStandalone()
  const persist = settings.persistGranted

  const [opDraft, setOpDraft] = useState(settings.opDate ?? '')
  const [weekDraft, setWeekDraft] = useState<number | null>(null)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0)
  const [repairConfirm, setRepairConfirm] = useState(false)

  const opChanged = opDraft !== (settings.opDate ?? '')
  const opValid = opDraft === '' || isDateStr(opDraft)
  const currentWeek = Math.max(derived.ctx.programWeek, 1)

  const exercises = Object.values(plan.exercises)
    .filter((e) => e.incrementKg !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  async function checkUpdate() {
    setUpdateMsg('Prüfe …')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) return setUpdateMsg('Kein Service Worker aktiv. Öffne die App einmal mit Internet.')
      await reg.update()
      setUpdateMsg(reg.waiting || reg.installing ? 'Neue Version gefunden. Der Hinweis erscheint oben.' : 'Die App ist aktuell.')
    } catch {
      setUpdateMsg('Prüfung fehlgeschlagen. Besteht eine Internetverbindung?')
    }
  }

  async function setRepair(on: boolean) {
    await updateSettings(
      on
        ? { repairMode: true, repairSince: today, repairPhaseId: plan.phase.id, opAskedFor: settings.opDate }
        : { repairMode: false, repairSince: null, repairPhaseId: null },
    )
    setRepairConfirm(false)
  }

  async function exportThenContinue() {
    const backup = await exportBackup(plan.planVersion)
    const outcome = await shareJsonFile(backupFileName(backup.exportedAt), JSON.stringify(backup))
    if (outcome !== 'cancelled') setWipeStep(2)
  }

  return (
    <main className={s.scroll}>
      <p className={s.kicker}>System</p>

      {planError && (
        <Panel tone="alarm" title="Trainingsplan">
          <p className={s.text}>{planError}</p>
        </Panel>
      )}

      <Panel title="OP-Termin">
        <div className={s.stack}>
          <input
            className={s.input}
            type="date"
            aria-label="OP-Termin"
            value={opDraft}
            onChange={(e) => setOpDraft(e.target.value)}
          />
          <p className={s.muted}>
            {settings.opDate ? `Gespeichert: ${formatDateDe(settings.opDate)}.` : 'Noch kein Termin gespeichert.'} In den
            letzten {plan.schedule.taper.daysBeforeOp} Tagen davor gilt der Taper, die letzten{' '}
            {plan.schedule.taper.restDaysBeforeOp} Tage sind frei.
          </p>
          {opChanged && (
            <div className={s.rowBetween}>
              <Button variant="secondary" disabled={!opValid} onClick={() => void updateSettings({ opDate: opDraft === '' ? null : opDraft })}>
                {opDraft === '' ? 'Termin entfernen' : 'Termin speichern'}
              </Button>
              <Button variant="quiet" onClick={() => setOpDraft(settings.opDate ?? '')}>
                Verwerfen
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Programmwoche">
        <div className={s.stack}>
          <p className={s.muted}>
            Programmstart {settings.programStart ? formatDateDe(settings.programStart) : 'offen'}. Eine Korrektur verschiebt
            den Programmstart; bereits protokollierte Einheiten behalten ihre Woche.
          </p>
          <Stepper label="Aktuelle Woche" unit="" value={weekDraft ?? currentWeek} step={1} min={1} max={60} onChange={(v) => setWeekDraft(v)} />
          {weekDraft !== null && weekDraft !== currentWeek && (
            <Button
              onClick={() => {
                void updateSettings({ programStart: programStartForWeek(today, weekDraft) })
                setWeekDraft(null)
              }}
            >
              Woche {weekDraft} übernehmen
            </Button>
          )}
        </div>
      </Panel>

      <Panel title="Darstellung und Ton">
        <Toggle label="Stimme" value={settings.voice} onChange={(voice) => void updateSettings({ voice })} />
        <Toggle label="Signaltöne" value={settings.sound} onChange={(sound) => void updateSettings({ sound })} />
        <Toggle label="Boot-Sequenz" value={settings.bootSequence} onChange={(bootSequence) => void updateSettings({ bootSequence })} />
        <Toggle label="Animationen reduzieren" value={settings.reduceMotion} onChange={(reduceMotion) => void updateSettings({ reduceMotion })} />
      </Panel>

      <Panel title="Laststufen je Übung">
        <details className={s.details}>
          <summary className={s.summary}>
            <span>Laststufen anpassen</span>
            <span className={`${s.tag} num`}>{Object.keys(settings.incrementOverrides).length} geändert</span>
          </summary>
          <p className={s.muted}>Schrittweite der Steigerung und der ±-Tasten, passend zu den Scheiben und Geräten im Studio.</p>
          {exercises.map((e) => {
            const override = settings.incrementOverrides[e.id]
            return (
              <div key={e.id} className={s.stack} style={{ padding: '10px 0' }}>
                <div className={s.rowBetween}>
                  <span>{e.name}</span>
                  {override !== undefined && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        const next = { ...settings.incrementOverrides }
                        delete next[e.id]
                        void updateSettings({ incrementOverrides: next })
                      }}
                    >
                      Plan: {formatKg(e.incrementKg!)} kg
                    </Button>
                  )}
                </div>
                <Stepper
                  label="Laststufe"
                  unit="kg"
                  value={override ?? e.incrementKg!}
                  step={0.5}
                  min={0.5}
                  max={20}
                  format={formatKg}
                  onChange={(v) => v !== null && void updateSettings({ incrementOverrides: { ...settings.incrementOverrides, [e.id]: v } })}
                />
              </div>
            )
          })}
        </details>
      </Panel>

      <Panel title="Datensicherung">
        <div className={s.stack}>
          <Row label="Speicherschutz" value={persist === true ? 'aktiv' : persist === false ? 'nicht bestätigt' : 'nicht angefragt'} />
          {persist !== true && (
            <Button onClick={() => void requestPersistence().then((granted) => updateSettings({ persistGranted: granted }))}>
              Speicherschutz anfragen
            </Button>
          )}
          {persist === false && <p className={s.warn}>{say('storageWarning')}</p>}
          <BackupPanel planVersion={plan.planVersion} lastBackupAt={settings.lastBackupAt} onChanged={() => void reload()} />
        </div>
      </Panel>

      <Panel title="Version">
        <Row label="App-Version" value={__APP_VERSION__} />
        <Row label="Trainingsplan" value={`${plan.planVersion} · ${plan.phase.name}`} />
        <Row label="Startmodus" value={standalone ? 'Vollbild' : 'Browser'} />
        <Row label="Offline" value={offlineReady ? 'bereit' : 'wird vorbereitet …'} />
        <div className={s.stack} style={{ marginTop: 8 }}>
          <Button onClick={() => void checkUpdate()}>Update prüfen</Button>
          {updateMsg && (
            <p className={s.muted} role="status">
              {updateMsg}
            </p>
          )}
        </div>
      </Panel>

      {!standalone && (
        <Panel title="Zum Home-Bildschirm hinzufügen" tone="warn">
          <InstallHint />
        </Panel>
      )}

      <Panel title="Reparaturmodus">
        <div className={s.stack}>
          <p className={s.muted}>
            Nach der OP: keine Missionen, keine Mahnungen, Mark und Punkte eingefroren. Das Gewicht lässt sich weiter
            protokollieren.
          </p>
          <Button variant={settings.repairMode ? 'secondary' : 'danger'} onClick={() => setRepairConfirm(true)}>
            {settings.repairMode ? 'Reparaturmodus beenden' : 'Reparaturmodus starten'}
          </Button>
        </div>
      </Panel>

      {import.meta.env.DEV && (
        <Panel title="Entwickler">
          <Button
            onClick={() =>
              void import('../dev/seedData')
                .then(({ buildSeed }) => importBackup(buildSeed(plan, { today, weeksBack: 7 })))
                .then(() => reload())
            }
          >
            Beispieldaten laden (ersetzt alles)
          </Button>
        </Panel>
      )}

      <Panel title="Daten löschen" tone="alarm">
        <div className={s.stack}>
          <p className={s.muted}>Entfernt alle Protokolle und Einstellungen von diesem iPhone. Der Trainingsplan bleibt.</p>
          <Button variant="danger" onClick={() => setWipeStep(1)}>
            Alle Daten löschen
          </Button>
        </div>
      </Panel>

      {repairConfirm && (
        <Dialog
          title={settings.repairMode ? 'Reparaturmodus beenden?' : 'Reparaturmodus starten?'}
          actions={
            <>
              <Button variant="danger" onClick={() => void setRepair(!settings.repairMode)}>
                {settings.repairMode ? 'Beenden' : 'Starten'}
              </Button>
              <Button variant="quiet" onClick={() => setRepairConfirm(false)}>
                Abbrechen
              </Button>
            </>
          }
        >
          <p>
            {settings.repairMode
              ? 'Missionen sind danach wieder freigegeben. Serien und Marks laufen ab heute weiter.'
              : 'Missionen werden gesperrt, Mark und Punkte eingefroren, bis ein neuer Trainingsplan geladen und ein neuer Programmstart bestätigt ist.'}
          </p>
        </Dialog>
      )}

      {wipeStep === 1 && (
        <Dialog
          title="Vorher ein Backup sichern?"
          actions={
            <>
              <Button variant="primary" onClick={() => void exportThenContinue()}>
                Backup erstellen
              </Button>
              <Button variant="danger" onClick={() => setWipeStep(2)}>
                Ohne Backup fortfahren
              </Button>
              <Button variant="quiet" onClick={() => setWipeStep(0)}>
                Abbrechen
              </Button>
            </>
          }
        >
          <p>Gelöschte Daten lassen sich nur aus einem Backup wiederherstellen.</p>
        </Dialog>
      )}
      {wipeStep === 2 && (
        <Dialog
          title="Wirklich alles löschen?"
          actions={
            <>
              <Button
                variant="danger"
                onClick={() => {
                  void wipeUserData().then(() => reload())
                  setWipeStep(0)
                }}
              >
                Endgültig löschen
              </Button>
              <Button variant="primary" onClick={() => setWipeStep(0)}>
                Abbrechen
              </Button>
            </>
          }
        >
          <p>Alle Einheiten, Sätze, Knie-Checks, Wägungen, Marks und Einstellungen werden entfernt. Die App startet danach mit der Einrichtung.</p>
        </Dialog>
      )}
    </main>
  )
}
