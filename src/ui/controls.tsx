import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { parseDe } from './format'
import styles from './controls.module.css'

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet'

export function Button({
  variant = 'secondary',
  block,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      type="button"
      className={[styles.btn, styles[variant], block ? styles.block : '', className ?? ''].join(' ')}
      {...rest}
    />
  )
}

export function Panel({
  title,
  children,
  tone,
  label,
}: {
  title?: string
  children: ReactNode
  tone?: 'warn' | 'alarm' | 'active'
  label?: string
}) {
  return (
    <section className={styles.panel} data-tone={tone} aria-label={label ?? title}>
      {title && <h2 className={styles.panelTitle}>{title}</h2>}
      {children}
    </section>
  )
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className={styles.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={styles.segBtn}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const plainNumber = (n: number) => String(n).replace('.', ',')

/** Große ±-Tasten mit Zifferneingabe (deutsches Komma). */
export function Stepper({
  label,
  unit,
  value,
  step,
  min = 0,
  max = 9999,
  format = plainNumber,
  onChange,
}: {
  label: string
  unit: string
  value: number | null
  step: number
  min?: number
  max?: number
  format?: (n: number) => string
  onChange: (v: number | null) => void
}) {
  const [text, setText] = useState(value === null ? '' : format(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setText(value === null ? '' : format(value))
  }, [value, editing, format])

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100))
  const bump = (dir: 1 | -1) => onChange(clamp((value ?? min) + dir * step))
  const stepLabel = String(step).replace('.', ',')

  return (
    <div className={styles.stepper}>
      <button type="button" className={styles.stepBtn} onClick={() => bump(-1)} aria-label={`${label} minus ${stepLabel}`}>
        −{stepLabel}
      </button>
      <label className={styles.stepField}>
        <span className={styles.stepLabel}>{label}</span>
        <span className={styles.stepValue}>
          <input
            className={`${styles.stepInput} num`}
            aria-label={label}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={text}
            placeholder="–"
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onChange={(e) => {
              setText(e.target.value)
              const n = parseDe(e.target.value)
              onChange(n === null ? null : clamp(n))
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
          <span className={styles.stepUnit}>{unit}</span>
        </span>
      </label>
      <button type="button" className={styles.stepBtn} onClick={() => bump(1)} aria-label={`${label} plus ${stepLabel}`}>
        +{stepLabel}
      </button>
    </div>
  )
}

export function Dialog({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <div className={styles.scrim}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <div className={styles.dialogBody}>{children}</div>
        <div className={styles.dialogActions}>{actions}</div>
      </div>
    </div>
  )
}

export function JarvisLine({ text }: { text: string | null }) {
  if (!text) return null
  return <p className={styles.jarvis}>„{text}“</p>
}
