import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { buildSeed } from '../src/dev/seedData'
import { parsePlan } from '../src/domain/plan'

const TODAY = '2026-11-11'
const rawPlan = () => JSON.parse(readFileSync(path.join(process.cwd(), 'public/plan.json'), 'utf8'))

function seedFile(): string {
  const parsed = parsePlan(rawPlan())
  if (!parsed.ok) throw new Error('plan.json ungültig')
  const dir = path.join(process.cwd(), 'test-results')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'seed-hardening.json')
  writeFileSync(file, JSON.stringify(buildSeed(parsed.plan, { today: TODAY, weeksBack: 7 })))
  return file
}

async function importSeed(page: Page) {
  await page.getByLabel('Backup-Datei wählen').setInputFiles(seedFile())
  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click() // Mark-Aufstieg
}

test.describe('Offline', () => {
  test('App startet und protokolliert ohne Netz', async ({ page, context }) => {
    test.setTimeout(90_000)
    await page.clock.setFixedTime(new Date(`${TODAY}T18:00:00+01:00`))
    await page.goto('./')
    await importSeed(page)
    await page.getByRole('button', { name: 'SYSTEM' }).click()
    await expect(page.getByText('bereit', { exact: true })).toBeVisible({ timeout: 20_000 })

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('img', { name: /2 von 4 Pflichteinheiten/ })).toBeVisible()
    await page.getByRole('button', { name: 'SYSTEM' }).click()
    await expect(page.getByText(/^1\.0\.0 · /)).toBeVisible()

    // Bonuseinheit starten und einen Eintrag speichern
    await page.getByRole('button', { name: 'HOME' }).click()
    await page.getByRole('button', { name: 'Mission starten' }).click()
    await page.getByRole('radio', { name: 'keine' }).click()
    await page.getByRole('radio', { name: 'Schmerz 0' }).click()
    for (const group of ['Auffällige Morgensteifigkeit der Sehne?', 'Wegknicken in den letzten 48 Stunden?', 'Blockade oder Einklemmen?']) {
      await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: 'nein' }).click()
    }
    await page.getByRole('button', { name: 'Knie-Check abschließen' }).click()
    await page.getByRole('button', { name: 'Weiter' }).click()
    await expect(page.getByRole('heading', { name: 'Rad locker (Zone 2)' })).toBeVisible()
    await page.getByRole('button', { name: 'Satz speichern' }).click()
    await expect(page.getByText('30 min')).toBeVisible()

    // Neustart ohne Netz: Eintrag ist noch da
    await page.reload()
    await page.getByRole('button', { name: 'Mission fortsetzen' }).click()
    await page.getByRole('button', { name: 'Zur Übersicht' }).click()
    await expect(page.getByRole('button', { name: /Rad locker \(Zone 2\).*1\/1/ })).toBeVisible()
  })
})

test.describe('Planwechsel', () => {
  // Ohne Service Worker, damit der Test die Auslieferung von plan.json steuern kann.
  test.use({ serviceWorkers: 'block' })

  test('neue planVersion kommt ohne Codeänderung an, alte Logs bleiben lesbar, kaputter Plan wird abgelehnt', async ({ page }) => {
    test.setTimeout(90_000)
    await page.clock.setFixedTime(new Date(`${TODAY}T18:00:00+01:00`))
    await page.goto('./')
    await importSeed(page)

    // Phase-2-artiger Plan: neue Version, Übung umbenannt, eine Einheit gestrichen, Satzzahl geändert
    const next = rawPlan()
    next.planVersion = '1.1.0'
    next.exercises.legpress_single.name = 'Beinpresse einbeinig (neu benannt)'
    next.exercises.bench_press.sets = 5
    next.sessions = next.sessions.filter((s: { id: string }) => s.id !== 'bonus_swim_bike')
    next.schedule.bonusPerWeek = 1
    await page.route('**/plan.json', (route) => route.fulfill({ json: next }))
    await page.reload()

    await expect(page.getByText('Neuer Trainingsplan geladen: Version 1.1.0.')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/m6-plan-updated.png' })
    await page.getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('img', { name: /0 von 1 Bonuseinheiten/ })).toBeVisible()

    // Alte Logs: Schnappschuss des alten Namens im Übungsverlauf, alte Einheit im Wochenverlauf
    await page.getByRole('button', { name: 'STATUS' }).click()
    await expect(page.getByRole('combobox')).toContainText('Beinpresse einbeinig')
    await page.getByRole('button', { name: 'WOCHE' }).click()
    await page.getByText(/Woche 7 · /).click()
    await expect(page.getByRole('button', { name: /Schwimmen oder Rad.*öffnen/ }).first()).toBeVisible()
    await page.getByRole('button', { name: /Schwimmen oder Rad.*öffnen/ }).first().click()
    await expect(page.getByText('Diese Einheit gibt es im aktuellen Trainingsplan nicht mehr.')).toBeVisible()
    await page.getByRole('button', { name: 'Schließen' }).click()

    // Kaputter Plan: wird abgelehnt, 1.1.0 bleibt aktiv, SYSTEM meldet es
    await page.unroute('**/plan.json')
    await page.route('**/plan.json', (route) => route.fulfill({ json: { ...next, planVersion: '9.9.9', sessions: [] } }))
    await page.reload()
    await page.getByRole('button', { name: 'SYSTEM' }).click()
    await expect(page.getByText(/ungültig und wurde nicht übernommen/)).toBeVisible()
    await expect(page.getByText(/^1\.1\.0 · /)).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/m6-plan-invalid.png' })
  })
})
