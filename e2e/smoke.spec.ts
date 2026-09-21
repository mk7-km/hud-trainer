import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png` })

test('Onboarding, komplette Mission, Fortsetzen, Backup – ohne fremde Anfragen', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const foreign: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url)
  })
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  // Dienstag der Kalibrierungswoche
  await page.clock.setFixedTime(new Date('2026-09-22T17:00:00+02:00'))
  await page.goto('./')

  // Onboarding
  await expect(page.getByRole('heading', { name: 'J.A.R.V.I.S. Trainer' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Mo 21.09.' })).toBeChecked()
  await shot(page, 'm2-onboarding')
  await page.getByRole('button', { name: 'Einrichtung abschließen' }).click()

  // HOME
  await expect(page.getByText('Kalibrierung')).toBeVisible()
  await expect(page.getByText('0 / 4 Pflicht')).toBeVisible()
  await shot(page, 'm2-home')
  await page.getByRole('button', { name: 'Mission starten' }).click()

  // Knie-Check
  await page.getByRole('radio', { name: 'keine' }).click()
  await page.getByRole('radio', { name: 'Schmerz 0' }).click()
  for (const group of ['Auffällige Morgensteifigkeit der Sehne?', 'Wegknicken in den letzten 48 Stunden?', 'Blockade oder Einklemmen?']) {
    await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: 'nein' }).click()
  }
  await shot(page, 'm2-kneecheck')
  await page.getByRole('button', { name: 'Knie-Check abschließen' }).click()
  await expect(page.getByRole('heading', { name: 'Grün' })).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()

  // Aufwärmen
  await page.getByRole('checkbox').first().click()
  await shot(page, 'm2-warmup')
  await page.getByRole('button', { name: 'Aufwärmen erledigt' }).click()

  // Erster Satz: Kalibrierung → Last finden, 2 Sätze
  await expect(page.getByRole('heading', { name: 'Kniebeuge mit Langhantel' })).toBeVisible()
  await expect(page.getByText('Last finden')).toBeVisible()
  await page.getByRole('textbox', { name: 'Gewicht' }).fill('57,5')
  await page.getByRole('radio', { name: '3', exact: true }).click()
  await shot(page, 'm2-exercise')
  await page.getByRole('button', { name: 'Satz speichern' }).click()
  await expect(page.getByText('57,5 kg × 6')).toBeVisible()
  await expect(page.getByRole('timer', { name: 'Pause' })).toBeVisible()
  await shot(page, 'm2-rest')

  // Unterbrechung: neu laden, fortsetzen – der Satz ist noch da
  await page.reload()
  await page.getByRole('button', { name: 'Mission fortsetzen' }).click()
  await expect(page.getByText('57,5 kg × 6')).toBeVisible()

  // Rest der Einheit durchspielen
  const finishBtn = page.getByRole('button', { name: 'Zur Übersicht und beenden' })
  for (let i = 0; i < 400 && !(await finishBtn.isVisible()); i++) {
    const next = page.getByRole('button', { name: /^Nächste Übung/ })
    const save = page.getByRole('button', { name: 'Satz speichern' })
    const unchecked = page.getByRole('checkbox', { checked: false })
    if (await next.isVisible()) await next.click()
    else if (await save.isVisible()) {
      const weight = page.getByRole('textbox', { name: 'Gewicht' })
      if ((await weight.count()) > 0 && (await weight.inputValue()) === '') await weight.fill('40')
      await save.click()
    } else if ((await unchecked.count()) > 0) await unchecked.first().click()
    await page.waitForTimeout(40)
  }
  await finishBtn.click()
  await shot(page, 'm2-overview')
  await page.getByRole('button', { name: 'Mission beenden' }).click()

  // Abschluss
  await expect(page.getByText('Mission abgeschlossen', { exact: true })).toBeVisible()
  await expect(page.getByText('+100 Punkte')).toBeVisible()
  await shot(page, 'm2-summary')
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByText('1 / 4 Pflicht')).toBeVisible()

  // Zweite Beineinheit am selben Tag: 48-Stunden-Warnung
  await page.getByRole('button', { name: 'WOCHE' }).click()
  await page.getByRole('button', { name: /Unterkörper B.*starten/ }).click()
  await expect(page.getByRole('alertdialog', { name: 'Zu früh für die Beine' })).toBeVisible()
  await shot(page, 'm2-too-soon')
  await page.getByRole('button', { name: 'Andere Einheit wählen' }).click()

  // SYSTEM: Backup exportieren und wieder einspielen
  await page.getByRole('button', { name: 'SYSTEM' }).click()
  await expect(page.getByText('bereit', { exact: true })).toBeVisible({ timeout: 15_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup erstellen' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^trainer-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await page.getByLabel('Backup-Datei wählen').setInputFiles(await download.path())
  await expect(page.getByText(/1 Einheiten, \d+ Sätze/)).toBeVisible()
  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  await expect(page.getByText('Backup eingespielt.')).toBeVisible()
  await shot(page, 'm2-system')

  expect(foreign).toEqual([])
  expect(errors).toEqual([])
})
