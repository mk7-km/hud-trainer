import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import jarvis from './content/jarvis.de.json'
import { getSettings, patchSettings } from './db/db'
import { loadPlan, type LoadedPlan } from './db/planLoader'
import type { Settings } from './domain/types'
import { requestPersistence } from './platform/share'
import { isStandalone } from './platform/standalone'
import { BackupPanel } from './ui/BackupPanel'
import styles from './App.module.css'

// M0/M1: Statusseite. Beweist den Weg vom Code bis zum Home-Bildschirm und die Datensicherung.
export function App() {
  const [loaded, setLoaded] = useState<LoadedPlan | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const standalone = isStandalone()

  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const reloadSettings = useCallback(() => {
    void getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadPlan().then((res) => {
      if (!cancelled) setLoaded(res)
    })
    reloadSettings()
    return () => {
      cancelled = true
    }
  }, [reloadSettings])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  async function protectStorage() {
    const granted = await requestPersistence()
    setSettings(await patchSettings({ persistGranted: granted }))
  }

  const plan = loaded?.plan ?? null
  const persist = settings?.persistGranted

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <svg className={styles.reactor} viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" className={styles.ringThin} />
          <circle cx="100" cy="100" r="80" className={styles.ringSeg} pathLength={4} />
          <circle cx="100" cy="100" r="58" className={styles.ringThin} />
          <circle cx="100" cy="100" r="30" className={styles.core} />
        </svg>
        <h1 className={styles.title}>J.A.R.V.I.S. Trainer</h1>
        <p className={styles.line}>{jarvis.greeting[0]}</p>
      </header>

      <section className={styles.panel} aria-label="Systemstatus">
        <Row label="App-Version" value={__APP_VERSION__} />
        <Row
          label="Trainingsplan"
          value={
            loaded === null
              ? 'lädt …'
              : plan
                ? `Version ${plan.planVersion} · ${plan.sessions.length} Einheiten`
                : 'nicht geladen'
          }
          state={loaded !== null && !plan ? 'warn' : 'ok'}
        />
        <Row
          label="Startmodus"
          value={standalone ? 'Vollbild (Home-Bildschirm)' : 'Browser'}
          state={standalone ? 'ok' : 'warn'}
        />
        <Row
          label="Offline"
          value={offlineReady ? 'bereit' : 'wird vorbereitet …'}
          state={offlineReady ? 'ok' : 'warn'}
        />
        <Row label="Netz" value={online ? 'verbunden' : 'getrennt'} />
        <Row
          label="Speicherschutz"
          value={persist === true ? 'aktiv' : persist === false ? 'nicht bestätigt' : 'nicht angefragt'}
          state={persist === true ? 'ok' : 'warn'}
        />
      </section>

      {loaded?.error && (
        <p className={styles.alert} role="alert">
          {loaded.error}
        </p>
      )}

      <section className={styles.panel} aria-label="Datensicherung">
        <h2 className={styles.h2}>Datensicherung</h2>
        {persist !== true && (
          <button className={styles.button} onClick={() => void protectStorage()}>
            Speicherschutz anfragen
          </button>
        )}
        {persist === false && <p className={styles.hint}>{jarvis.storageWarning[0]}</p>}
        <BackupPanel
          planVersion={plan?.planVersion ?? null}
          lastBackupAt={settings?.lastBackupAt ?? null}
          onChanged={reloadSettings}
        />
      </section>

      {!standalone && (
        <section className={styles.panel}>
          <h2 className={styles.h2}>Zum Home-Bildschirm hinzufügen</h2>
          <ol className={styles.steps}>
            <li>In Safari unten auf „Teilen“ tippen (Quadrat mit Pfeil nach oben).</li>
            <li>Nach unten blättern und „Zum Home-Bildschirm“ wählen.</li>
            <li>Mit „Hinzufügen“ bestätigen und die App vom Home-Bildschirm starten.</li>
          </ol>
        </section>
      )}

      {needRefresh && (
        <div className={styles.update} role="status">
          <span>{jarvis.updateAvailable[0]}</span>
          <button className={styles.button} onClick={() => void updateServiceWorker(true)}>
            Aktualisieren
          </button>
        </div>
      )}
    </main>
  )
}

function Row({ label, value, state }: { label: string; value: string; state?: 'ok' | 'warn' }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} num`} data-state={state}>
        {value}
      </span>
    </div>
  )
}
