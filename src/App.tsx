import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { say } from './content/jarvis'
import type { Plan } from './domain/plan'
import { setSoundEnabled, unlockAudio } from './platform/audio'
import { setVoiceEnabled, speak, unlockVoice } from './platform/voice'
import { Boot } from './screens/Boot'
import { Home } from './screens/Home'
import { Mission } from './screens/mission/Mission'
import { Onboarding } from './screens/Onboarding'
import { MarkUpOverlay, OpDoneDialog } from './screens/Overlays'
import { Status } from './screens/Status'
import { System } from './screens/System'
import { Week } from './screens/Week'
import { useDerived } from './state/derived'
import { useMarkSync } from './state/marks'
import { TooSoonDialog } from './state/start'
import { useApp } from './state/store'
import { useUi, type Tab } from './state/ui'
import { Button } from './ui/controls'
import s from './screens/screen.module.css'
import styles from './App.module.css'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'week', label: 'WOCHE' },
  { id: 'status', label: 'STATUS' },
  { id: 'system', label: 'SYSTEM' },
]

export function App() {
  const ready = useApp((st) => st.ready)
  const plan = useApp((st) => st.plan)
  const planError = useApp((st) => st.planError)
  const onboardingDone = useApp((st) => st.settings.onboardingDone)
  const init = useApp((st) => st.init)
  const refreshToday = useApp((st) => st.refreshToday)

  useEffect(() => {
    void init()
  }, [init])

  // Tageswechsel erkennen, wenn die App aus dem Hintergrund kommt.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refreshToday()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshToday])

  if (!ready) return <div className={styles.boot} aria-busy="true" />

  if (!plan) {
    return (
      <main className={s.scrollFull}>
        <h1 className={s.h1}>Trainingsplan fehlt</h1>
        <p className={s.text}>{planError ?? 'Der Trainingsplan konnte nicht geladen werden.'}</p>
        <p className={s.muted}>Verbinde das iPhone mit dem Internet und öffne die App erneut.</p>
        <Button variant="primary" block onClick={() => window.location.reload()}>
          Erneut laden
        </Button>
      </main>
    )
  }

  if (!onboardingDone) return <Onboarding />
  return <Main plan={plan} />
}

// Kaltstart: gilt nur für den ersten Aufbau nach dem Laden der Seite.
let coldStart = true

function Main({ plan }: { plan: Plan }) {
  const planUpdatedTo = useApp((st) => st.planUpdatedTo)
  const dismissPlanUpdated = useApp((st) => st.dismissPlanUpdated)
  const tab = useUi((u) => u.tab)
  const setTab = useUi((u) => u.setTab)
  const mission = useUi((u) => u.mission)
  const reduceMotion = useApp((st) => st.settings.reduceMotion)
  const derived = useDerived(plan)
  useMarkSync(plan, derived)

  const sound = useApp((st) => st.settings.sound)
  const voice = useApp((st) => st.settings.voice)
  const bootSequence = useApp((st) => st.settings.bootSequence)

  const [booting, setBooting] = useState(
    () => coldStart && bootSequence && !reduceMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [draw, setDraw] = useState(booting)
  const endBoot = useCallback(() => setBooting(false), [])

  useEffect(() => {
    if (booting) return
    const id = window.setTimeout(() => setDraw(false), 2000)
    return () => window.clearTimeout(id)
  }, [booting])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion)
  }, [reduceMotion])

  useEffect(() => {
    setSoundEnabled(sound)
    setVoiceEnabled(voice)
  }, [sound, voice])

  // Ton und Stimme erst nach der ersten Nutzergeste; dabei einmalig die Begrüßung.
  useEffect(() => {
    const greet = coldStart
    coldStart = false
    const onGesture = () => {
      unlockAudio()
      unlockVoice()
      if (greet) speak(say('greeting'))
    }
    window.addEventListener('pointerdown', onGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [])

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (booting) return <Boot planVersion={plan.planVersion} onDone={endBoot} />
  if (mission) return <Mission key={JSON.stringify(mission)} plan={plan} target={mission} />

  return (
    <div className={s.shell}>
      {needRefresh && (
        <div className={styles.banner} role="status">
          <span>{say('updateAvailable')}</span>
          <Button onClick={() => void updateServiceWorker(true)}>Aktualisieren</Button>
        </div>
      )}
      {planUpdatedTo && (
        <div className={styles.banner} role="status">
          <span>{say('planUpdated', { version: planUpdatedTo })}</span>
          <Button variant="quiet" onClick={dismissPlanUpdated}>
            Schließen
          </Button>
        </div>
      )}
      {tab === 'home' && <Home plan={plan} derived={derived} draw={draw} />}
      {tab === 'week' && <Week plan={plan} derived={derived} />}
      {tab === 'status' && <Status plan={plan} derived={derived} />}
      {tab === 'system' && <System plan={plan} derived={derived} />}
      <nav className={s.tabbar} aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={s.tab} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <TooSoonDialog plan={plan} />
      <OpDoneDialog plan={plan} derived={derived} />
      <MarkUpOverlay />
    </div>
  )
}
