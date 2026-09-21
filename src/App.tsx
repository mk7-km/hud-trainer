import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import jarvis from './content/jarvis.de.json'
import { isStandalone } from './platform/standalone'
import styles from './App.module.css'

type PlanState =
  | { status: 'loading' }
  | { status: 'ok'; planVersion: string; sessions: number }
  | { status: 'error' }

// M0: Statusseite. Beweist den Weg vom Code bis zum Home-Bildschirm.
export function App() {
  const [plan, setPlan] = useState<PlanState>({ status: 'loading' })
  const [online, setOnline] = useState(navigator.onLine)
  const standalone = isStandalone()

  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}plan.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((p: { planVersion?: unknown; sessions?: unknown }) => {
        if (cancelled) return
        if (typeof p.planVersion === 'string' && Array.isArray(p.sessions)) {
          setPlan({ status: 'ok', planVersion: p.planVersion, sessions: p.sessions.length })
        } else {
          setPlan({ status: 'error' })
        }
      })
      .catch(() => {
        if (!cancelled) setPlan({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

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
            plan.status === 'ok'
              ? `Version ${plan.planVersion} · ${plan.sessions} Einheiten`
              : plan.status === 'loading'
                ? 'lädt …'
                : 'nicht geladen'
          }
          state={plan.status === 'error' ? 'warn' : 'ok'}
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
