// Stimme über speechSynthesis mit deutscher Systemstimme. Nur zu seltenen Anlässen,
// nur nach einer Nutzergeste, Fehler werden still ignoriert.
//
// iOS-Eigenheiten, die hier berücksichtigt sind:
// - Die erste Ausgabe muss synchron in einer echten Aktivierungsgeste liegen (touchend/click, nicht pointerdown).
// - cancel() direkt vor speak() verschluckt die neue Ansage → nur abbrechen, wenn wirklich etwas läuft, dann kurz warten.
// - Utterances ohne Referenz werden teils vorzeitig eingesammelt → Referenz halten.

let enabled = true
let unlocked = false
let voice: SpeechSynthesisVoice | null = null
let current: SpeechSynthesisUtterance | null = null
let lastError: string | null = null

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

function pickVoice() {
  if (!supported()) return
  const german = window.speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('de'))
  voice = german.find((v) => /de-DE/i.test(v.lang.replace('_', '-')) && v.localService) ?? german[0] ?? null
}

if (supported()) {
  pickVoice()
  // Stimmen laden asynchron
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

export function setVoiceEnabled(on: boolean) {
  enabled = on
  if (!on && supported()) window.speechSynthesis.cancel()
}

function utter(text: string): SpeechSynthesisUtterance {
  if (!voice) pickVoice()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'de-DE'
  if (voice) u.voice = voice
  u.rate = 1.0
  u.pitch = 0.85
  u.volume = 1
  u.onerror = (e) => {
    lastError = e.error
  }
  u.onend = () => {
    if (current === u) current = null
  }
  current = u
  return u
}

/**
 * In einer echten Nutzergeste aufrufen (touchend/click). Spricht `text` sofort und synchron;
 * damit ist die Sprachausgabe für spätere, nicht gestengebundene Ansagen freigeschaltet.
 */
export function unlockVoice(text: string | null) {
  if (unlocked || !supported()) return
  unlocked = true
  if (!enabled) return
  try {
    // Leerzeichen-Ansage schaltet frei, ohne etwas zu sagen, falls kein Text ansteht.
    window.speechSynthesis.speak(utter(text ?? ' '))
  } catch {
    // still ignorieren
  }
}

export function speak(text: string | null) {
  if (!text || !enabled || !unlocked || !supported()) return
  try {
    const synth = window.speechSynthesis
    if (synth.paused) synth.resume()
    if (synth.speaking || synth.pending) {
      synth.cancel()
      window.setTimeout(() => synth.speak(utter(text)), 80)
    } else {
      synth.speak(utter(text))
    }
  } catch {
    // still ignorieren
  }
}

/** Für den Testknopf in SYSTEM: direkt in der Geste sprechen und den Zustand melden. */
export function testVoice(text: string): string {
  if (!supported()) return 'Dieses Gerät bietet Web-Apps keine Sprachausgabe an.'
  lastError = null
  unlocked = true
  try {
    const synth = window.speechSynthesis
    if (synth.speaking || synth.pending) synth.cancel()
    synth.speak(utter(text))
  } catch {
    return 'Die Sprachausgabe ließ sich nicht starten.'
  }
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return 'Ansage gestartet. iOS meldet (noch) keine Stimmen; bleibt es still, bitte Hinweise unten beachten.'
  return voice ? `Ansage gestartet mit Stimme „${voice.name}“ (${voice.lang}).` : 'Ansage gestartet. Keine deutsche Stimme gefunden, iOS wählt selbst.'
}

export function voiceError(): string | null {
  return lastError
}
