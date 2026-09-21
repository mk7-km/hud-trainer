// Erzeugt die PNG-Icons aus public/favicon.svg. Aufruf: npm run icons
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BG = '#02060A'
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true })

const out = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url))

async function plain(size, file) {
  await sharp(svg, { density: 300 }).resize(size, size).flatten({ background: BG }).png().toFile(out(file))
}

// Maskable: Symbol auf 70 % verkleinert, damit es in der Safe Zone bleibt.
async function maskable(size, file) {
  const inner = Math.round(size * 0.7)
  const pad = Math.round((size - inner) / 2)
  const img = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: img, left: pad, top: pad }])
    .png()
    .toFile(out(file))
}

await plain(192, 'icons/icon-192.png')
await plain(512, 'icons/icon-512.png')
await maskable(512, 'icons/icon-maskable-512.png')
await plain(180, 'apple-touch-icon.png')
console.log('Icons erzeugt.')
