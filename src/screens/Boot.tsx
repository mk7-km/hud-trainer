import { useEffect } from 'react'
import styles from './Boot.module.css'

export const BOOT_MS = 1400

/** Kurze Boot-Sequenz beim Kaltstart. Ein Tipp überspringt sie. Geht in das Aufzeichnen des Reaktors über. */
export function Boot({ planVersion, onDone }: { planVersion: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, BOOT_MS)
    return () => window.clearTimeout(id)
  }, [onDone])

  const rows = [
    ['Kern', 'online'],
    ['Speicher', 'lokal'],
    ['Plan', planVersion],
    ['Knie-Protokoll', 'bereit'],
  ]

  return (
    <button type="button" className={styles.boot} onClick={onDone} aria-label="Boot-Sequenz überspringen">
      <svg className={styles.rings} viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="146" className={styles.r1} />
        <circle cx="150" cy="150" r="114" className={styles.r2} />
        <circle cx="150" cy="150" r="88" className={styles.r3} />
        <circle cx="150" cy="150" r="66" className={styles.r4} />
        <circle cx="150" cy="150" r="5" className={styles.dot} />
      </svg>
      <div className={styles.log}>
        {rows.map(([k, v], i) => (
          <p key={k} className={styles.row} style={{ animationDelay: `${150 + i * 200}ms` }}>
            <span>{k}</span>
            <span className={styles.val}>{v}</span>
          </p>
        ))}
      </div>
    </button>
  )
}
