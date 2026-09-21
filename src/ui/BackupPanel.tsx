import { useRef, useState } from 'react'
import { backupFileName, exportBackup, importBackup, parseBackup, type Backup, type BackupSummary } from '../db/backup'
import { getSettings, patchSettings } from '../db/db'
import { formatDateDe } from '../domain/dates'
import { shareJsonFile } from '../platform/share'
import styles from './BackupPanel.module.css'

interface Props {
  planVersion: string | null
  lastBackupAt: number | null
  /** Nach Export oder Import: Daten neu laden. */
  onChanged: () => void
  /** Nur Import anbieten (Einrichtung auf einem neuen Gerät). */
  importOnly?: boolean
}

type Pending = { backup: Backup; summary: BackupSummary }

export function BackupPanel({ planVersion, lastBackupAt, onChanged, importOnly = false }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  async function createBackup() {
    setBusy(true)
    setMessage(null)
    try {
      const backup = await exportBackup(planVersion)
      const outcome = await shareJsonFile(backupFileName(backup.exportedAt), JSON.stringify(backup))
      if (outcome === 'cancelled') {
        setMessage('Backup abgebrochen. Es wurde nichts gesichert.')
      } else {
        await patchSettings({ lastBackupAt: Date.now() })
        setMessage(outcome === 'shared' ? 'Backup übergeben.' : 'Backup als Datei heruntergeladen.')
        onChanged()
      }
    } catch {
      setMessage('Backup fehlgeschlagen. Versuche es erneut.')
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    const parsed = parseBackup(await file.text())
    if (parsed.ok) {
      setPending({ backup: parsed.backup, summary: parsed.summary })
      setMessage(null)
    } else {
      setPending(null)
      setMessage(parsed.error)
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    try {
      await importBackup(pending.backup)
      // Die eingespielte Datei ist selbst ein Backup: ihr Datum zählt als letzter Sicherungsstand.
      const exportedAt = Date.parse(pending.summary.exportedAt)
      const current = (await getSettings()).lastBackupAt ?? 0
      if (Number.isFinite(exportedAt) && exportedAt > current) await patchSettings({ lastBackupAt: exportedAt })
      setMessage('Backup eingespielt.')
      setPending(null)
      onChanged()
    } catch {
      setMessage('Import fehlgeschlagen. Die vorhandenen Daten wurden nicht verändert.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      {!importOnly && (
        <p className={styles.info}>
          Letztes Backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleDateString('de-AT') : 'noch keines'}
        </p>
      )}
      <div className={styles.actions}>
        {!importOnly && (
          <button className={styles.primary} disabled={busy} onClick={() => void createBackup()}>
            Backup erstellen
          </button>
        )}
        <button className={styles.secondary} disabled={busy} onClick={() => fileInput.current?.click()}>
          Backup einspielen
        </button>
      </div>
      <input
        ref={fileInput}
        className={styles.file}
        type="file"
        accept="application/json,.json"
        aria-label="Backup-Datei wählen"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />

      {pending && (
        <div className={styles.confirm} role="alertdialog" aria-label="Import bestätigen">
          <p>
            Backup vom {formatDateDe(pending.summary.exportedAt.slice(0, 10))}:{' '}
            <span className="num">
              {pending.summary.sessions} Einheiten, {pending.summary.sets} Sätze,{' '}
              {pending.summary.bodyweight} Wägungen
            </span>
            {pending.summary.firstDate && pending.summary.lastDate && (
              <>
                {' '}
                ({formatDateDe(pending.summary.firstDate)} bis {formatDateDe(pending.summary.lastDate)})
              </>
            )}
            . Alle Daten auf diesem Gerät werden dadurch ersetzt.
          </p>
          <div className={styles.actions}>
            <button className={styles.danger} disabled={busy} onClick={() => void confirmImport()}>
              Daten ersetzen
            </button>
            <button className={styles.secondary} disabled={busy} onClick={() => setPending(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
    </div>
  )
}
