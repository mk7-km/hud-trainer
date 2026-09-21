export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Übergibt eine JSON-Datei an das Teilen-Menü („In Dateien sichern“); Fallback: Download. */
export async function shareJsonFile(fileName: string, json: string): Promise<ShareOutcome> {
  const file = new File([json], fileName, { type: 'application/json' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // andere Fehler: weiter zum Download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/** Fragt dauerhaften Speicher an. null = vom Browser nicht unterstützt. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch {
    return null
  }
}
