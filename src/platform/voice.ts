// Stimme über speechSynthesis mit deutscher Systemstimme. Nur zu seltenen Anlässen,
// nur nach einer Nutzergeste, Fehler werden still ignoriert.

let enabled = true
let unlocked = false
let voice: SpeechSynthesisVoice | null = null

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice() {
  if (!supported()) return
  const voices = window.speechSynthesis.getVoices()
  const german = voices.filter((v) => v.lang.toLowerCase().startsWith('de'))
  voice = german.find((v) => v.lang === 'de-DE' && v.localService) ?? german.find((v) => v.lang === 'de-DE') ?? german[0] ?? null
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

/** Bei der ersten Nutzergeste aufrufen. */
export function unlockVoice() {
  unlocked = true
}

export function speak(text: string | null) {
  if (!text || !enabled || !unlocked || !supported()) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'de-DE'
    if (voice) u.voice = voice
    u.rate = 1.0
    u.pitch = 0.85
    u.volume = 1
    u.onerror = () => undefined
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    // still ignorieren
  }
}
