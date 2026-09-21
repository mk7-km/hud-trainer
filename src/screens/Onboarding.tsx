import { useState } from 'react'
import { addDays, formatDateDe, isDateStr, suggestProgramStart } from '../domain/dates'
import { requestPersistence } from '../platform/share'
import { isStandalone } from '../platform/standalone'
import { useApp } from '../state/store'
import { BackupPanel } from '../ui/BackupPanel'
import { Button, Panel, Seg } from '../ui/controls'
import { say } from '../content/jarvis'
import s from './screen.module.css'

const ON_OFF = [
  { value: 'on', label: 'Ein' },
  { value: 'off', label: 'Aus' },
] as const

export function InstallHint() {
  return (
    <ol className={s.muted} style={{ paddingLeft: 20 }}>
      <li>In Safari unten auf „Teilen“ tippen (Quadrat mit Pfeil nach oben).</li>
      <li>„Zum Home-Bildschirm“ wählen und mit „Hinzufügen“ bestätigen.</li>
      <li>Die App künftig nur noch vom Home-Bildschirm starten.</li>
    </ol>
  )
}

export function Onboarding() {
  const today = useApp((st) => st.today)
  const updateSettings = useApp((st) => st.updateSettings)
  const reload = useApp((st) => st.reload)
  const suggestion = suggestProgramStart(today)
  const starts = [addDays(suggestion, -7), suggestion, addDays(suggestion, 7)]

  const [programStart, setProgramStart] = useState(suggestion)
  const [opDate, setOpDate] = useState('')
  const [voice, setVoice] = useState(true)
  const [sound, setSound] = useState(true)
  const [persist, setPersist] = useState<boolean | null | undefined>(undefined)

  const opValid = opDate === '' || (isDateStr(opDate) && opDate > today)

  async function finish() {
    await updateSettings({
      onboardingDone: true,
      programStart,
      opDate: opDate === '' ? null : opDate,
      voice,
      sound,
      persistGranted: persist ?? null,
    })
  }

  return (
    <main className={s.scrollFull}>
      <p className={s.kicker}>Einrichtung</p>
      <h1 className={s.h1}>J.A.R.V.I.S. Trainer</h1>

      {!isStandalone() && (
        <Panel title="Zuerst: zum Home-Bildschirm hinzufügen" tone="warn">
          <p className={s.warn}>
            Richte die App erst ein, nachdem du sie vom Home-Bildschirm gestartet hast. iOS trennt die Daten von
            Safari und Home-Bildschirm, eine Einrichtung in Safari ginge verloren.
          </p>
          <InstallHint />
        </Panel>
      )}

      <Panel title="Programmstart">
        <div className={s.stack}>
          <p className={s.muted}>Programmwoche 1 ist die Kalibrierungswoche. Sie beginnt an einem Montag.</p>
          <Seg
            label="Programmstart"
            value={programStart}
            onChange={setProgramStart}
            options={starts.map((d) => ({ value: d, label: `Mo ${formatDateDe(d).slice(0, 6)}` }))}
          />
        </div>
      </Panel>

      <Panel title="OP-Termin (optional)">
        <label className={s.field}>
          Steht der Termin noch nicht fest, bleibt das Feld leer. Er lässt sich jederzeit in SYSTEM ändern.
          <input
            className={s.input}
            type="date"
            min={addDays(today, 1)}
            value={opDate}
            onChange={(e) => setOpDate(e.target.value)}
          />
        </label>
        {!opValid && <p className={s.warn}>Der OP-Termin muss in der Zukunft liegen.</p>}
      </Panel>

      <Panel title="Stimme und Ton">
        <div className={s.stack}>
          <div className={s.rowBetween}>
            <span>Stimme (selten, kurze Ansagen)</span>
            <div style={{ width: 140 }}>
              <Seg label="Stimme" value={voice ? 'on' : 'off'} onChange={(v) => setVoice(v === 'on')} options={ON_OFF} />
            </div>
          </div>
          <div className={s.rowBetween}>
            <span>Signaltöne</span>
            <div style={{ width: 140 }}>
              <Seg label="Signaltöne" value={sound ? 'on' : 'off'} onChange={(v) => setSound(v === 'on')} options={ON_OFF} />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Daten schützen">
        <div className={s.stack}>
          <p className={s.muted}>
            Alle Daten liegen nur auf diesem iPhone. iOS kann Daten von Web-Apps löschen. Deshalb: Speicherschutz
            anfragen und wöchentlich ein Backup in „Dateien“ sichern. Die App erinnert daran.
          </p>
          {persist === undefined ? (
            <Button onClick={() => void requestPersistence().then(setPersist)}>Speicherschutz anfragen</Button>
          ) : persist ? (
            <p className={s.text}>Speicherschutz aktiv.</p>
          ) : (
            <p className={s.warn}>{say('storageWarning')}</p>
          )}
        </div>
      </Panel>

      <Panel title="Schon ein Backup vorhanden?">
        <p className={s.muted}>Auf einem neuen Gerät: Backup einspielen statt neu einrichten.</p>
        <BackupPanel planVersion={null} lastBackupAt={null} importOnly onChanged={() => void reload()} />
      </Panel>

      <Button variant="primary" block disabled={!opValid} onClick={() => void finish()}>
        Einrichtung abschließen
      </Button>
    </main>
  )
}
