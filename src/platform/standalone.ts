/** Läuft die App vom Home-Bildschirm (Vollbild) oder im Browser-Tab? */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}
