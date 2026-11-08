'use client'

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { InspectionId, MediaItem, Report } from '@/lib/types'
import { INSPECTION_ORDER } from '@/lib/report-utils'
import { createClient } from '@/lib/supabase/client'
import { PAGE_HEIGHT, PAGE_WIDTH, PDF_INSPECTION_LABELS, ReportPdfPages, type PdfData, type PdfPhoto, type PdfPhotoPair } from './report-pdf-pages'

export type PdfProgress = { step: string; done: number; total: number }

// Largest side of a photo inside the PDF. Phone photos are scaled down so the file stays small enough to send.
const MAX_PHOTO_SIDE = 1400
// Page text is captured at a lower resolution on phones to stay within their memory limits.
const CAPTURE_PIXEL_RATIO = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2

export function reportVideos(report: Report): { item: MediaItem; inspection: InspectionId }[] {
  return report.inspections.flatMap((inspection) => inspection.media.filter((item) => item.kind === 'video').map((item) => ({ item, inspection: inspection.id })))
}

// Builds the report PDF in the browser and downloads it. When the report has videos, the PDF and
// the videos are downloaded together as one ZIP, since videos cannot be placed inside a PDF.
export async function exportReport(report: Report, onProgress?: (progress: PdfProgress) => void): Promise<{ missingPhotos: number }> {
  const { pdf, missingPhotos } = await buildReportPdf(report, onProgress)
  const baseName = reportFileBaseName(report)
  const videos = reportVideos(report)
  if (videos.length === 0) {
    saveBlob(pdf, `${baseName}.pdf`)
    return { missingPhotos }
  }

  const { downloadZip } = await import('client-zip')
  const usedNames = new Set<string>([`${baseName}.pdf`])
  const entries: { name: string; input: Blob; lastModified: Date }[] = [{ name: `${baseName}.pdf`, input: pdf, lastModified: new Date() }]
  for (const [index, { item, inspection }] of videos.entries()) {
    onProgress?.({ step: 'מוריד סרטונים', done: index, total: videos.length })
    const response = await fetch(await resolveMediaUrl(item))
    if (!response.ok) throw new Error(`Video download failed (${response.status}): ${item.name}`)
    const phase = item.phase === 'before' ? 'לפני' : 'אחרי'
    const name = uniqueName(usedNames, safeFileName(`${PDF_INSPECTION_LABELS[inspection]} - ${phase} - ${item.location || item.name}`), videoExtension(item))
    entries.push({ name, input: await response.blob(), lastModified: new Date() })
  }
  onProgress?.({ step: 'יוצר ZIP', done: videos.length, total: videos.length })
  saveBlob(await downloadZip(entries).blob(), `${baseName}.zip`)
  return { missingPhotos }
}

// Pages are laid out as HTML (so Hebrew and right-to-left text render correctly), captured as images and placed on A4 pages.
// Photos and logos are NOT part of that capture: Safari often drops images when capturing a page this way,
// which left the PDF without photos. They are drawn straight into the PDF at their measured positions instead.
async function buildReportPdf(report: Report, onProgress?: (progress: PdfProgress) => void): Promise<{ pdf: Blob; missingPhotos: number }> {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import('jspdf'), import('html-to-image')])

  const photos = report.inspections.flatMap((inspection) => inspection.media.filter((item) => item.kind === 'image'))
  let loaded = 0
  onProgress?.({ step: 'טוען תמונות', done: 0, total: photos.length })

  const [logo, association, watermark] = await Promise.all([
    loadImage('/report/shark-logo.png', 900, 'image/png'),
    loadImage('/report/association-logo.png', 600, 'image/png'),
    loadImage('/report/watermark.png', 900, 'image/png'),
  ])

  const photoSources = new Map<string, string>()
  let missingPhotos = 0
  await runLimited(photos, 3, async (item) => {
    try {
      photoSources.set(item.id, await loadImage(await resolveMediaUrl(item), MAX_PHOTO_SIDE, 'image/jpeg'))
    } catch (error) {
      console.error('Loading photo for PDF failed', item.name, error)
      missingPhotos += 1
    }
    loaded += 1
    onProgress?.({ step: 'טוען תמונות', done: loaded, total: photos.length })
  })

  const data = buildPdfData(report, photoSources, { logo, association, watermark })

  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = `position:fixed;top:0;left:-${PAGE_WIDTH * 2}px;width:${PAGE_WIDTH}px;pointer-events:none;z-index:-1;`
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    flushSync(() => root.render(<ReportPdfPages data={data} />))
    await Promise.all(Array.from(container.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)))

    const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page]'))
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const GState = (pdf as unknown as { GState: new (options: { opacity: number }) => unknown }).GState
    const mmPerPx = 210 / PAGE_WIDTH
    const withoutImages = (node: HTMLElement) => !(node instanceof HTMLImageElement && node.dataset.pdfImage !== undefined)
    for (const [index, page] of pages.entries()) {
      onProgress?.({ step: 'יוצר עמודים', done: index, total: pages.length })
      const text = await toJpeg(page, { width: PAGE_WIDTH, height: PAGE_HEIGHT, pixelRatio: CAPTURE_PIXEL_RATIO, quality: 0.85, backgroundColor: '#FFFFFF', skipFonts: true, cacheBust: false, filter: withoutImages })
      if (index > 0) pdf.addPage()
      pdf.addImage(text, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')

      const pageBox = page.getBoundingClientRect()
      for (const img of Array.from(page.querySelectorAll<HTMLImageElement>('img[data-pdf-image]'))) {
        const src = img.getAttribute('src') ?? ''
        const box = img.getBoundingClientRect()
        if (!src.startsWith('data:image/') || box.width === 0 || box.height === 0) continue
        const opacity = Number(img.dataset.opacity ?? '1')
        if (opacity < 1) {
          pdf.saveGraphicsState()
          pdf.setGState(new GState({ opacity }) as Parameters<typeof pdf.setGState>[0])
        }
        // The alias lets jsPDF embed a repeated image (logos, watermark) only once.
        pdf.addImage(src, src.startsWith('data:image/png') ? 'PNG' : 'JPEG', (box.left - pageBox.left) * mmPerPx, (box.top - pageBox.top) * mmPerPx, box.width * mmPerPx, box.height * mmPerPx, img.dataset.pdfImage || undefined, 'FAST')
        if (opacity < 1) pdf.restoreGraphicsState()
      }
    }
    onProgress?.({ step: 'שומר', done: pages.length, total: pages.length })
    pdf.setProperties({ title: `דוח בדיקת קווי דלוחים ${data.reportNumber}`.trim(), author: 'שארק רובוטים מתקדמים בע"מ' })
    return { pdf: pdf.output('blob'), missingPhotos }
  } finally {
    root.unmount()
    container.remove()
  }
}

function buildPdfData(report: Report, photoSources: Map<string, string>, assets: PdfData['assets']): PdfData {
  const { details } = report
  const unit = [details.building && `בניין ${details.building}`, details.floor && `קומה ${details.floor}`, details.apartment && `דירה ${details.apartment}`].filter(Boolean).join('  ')

  const byId = new Map(report.inspections.map((inspection) => [inspection.id, inspection]))
  const ordered = INSPECTION_ORDER.map((id) => byId.get(id)).filter((inspection) => inspection !== undefined)

  const results = ordered.map((inspection) => ({
    label: PDF_INSPECTION_LABELS[inspection.id],
    result: inspection.result,
    note: inspection.note.trim() || (inspection.result === 'ok' ? 'תקין' : inspection.result === 'not-ok' ? 'לא תקין' : 'לא בוצע'),
  }))

  const photoPairs: PdfPhotoPair[] = []
  for (const inspection of ordered) {
    const toPhoto = (item: MediaItem): PdfPhoto => {
      return { src: photoSources.get(item.id) ?? '', caption: item.location, note: item.note, id: item.id }
    }
    const before = inspection.media.filter((item) => item.kind === 'image' && item.phase === 'before').map(toPhoto)
    const after = inspection.media.filter((item) => item.kind === 'image' && item.phase === 'after').map(toPhoto)
    for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
      photoPairs.push({ before: before[i] ?? null, after: after[i] ?? null })
    }
  }

  return {
    reportNumber: details.reportNumber,
    inspectionDate: formatPdfDate(details.date),
    productionDate: formatPdfDate(new Date().toISOString().slice(0, 10)),
    clientName: details.clientName || details.project,
    address: details.address,
    unit,
    inspector: details.inspector,
    results,
    photoPairs,
    assets,
  }
}

async function resolveMediaUrl(item: MediaItem): Promise<string> {
  if (item.file || !item.storagePath) return item.url
  const { data, error } = await createClient().storage.from('report-media').createSignedUrl(item.storagePath, 600)
  if (error || !data?.signedUrl) throw error ?? new Error('no signed url')
  return data.signedUrl
}

// Loads an image and re-encodes it as a data URL scaled to maxSide.
// Decoding through an <img> element works in every browser (including formats only Safari can read) and
// applies the photo's camera rotation, unlike createImageBitmap options that some browsers reject.
async function loadImage(url: string, maxSide: number, type: 'image/jpeg' | 'image/png'): Promise<string> {
  let objectUrl: string | null = null
  let img: HTMLImageElement
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    objectUrl = URL.createObjectURL(await response.blob())
    img = await decodeImage(objectUrl)
  } catch (fetchError) {
    // Fall back to loading the address directly (e.g. when fetch is blocked) before giving up.
    console.warn('Fetching image failed, loading it directly', url, fetchError)
    img = await decodeImage(url, true)
  }
  try {
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (!width || !height) throw new Error('empty image')
    const scale = Math.min(1, maxSide / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    if (type === 'image/jpeg') {
      context.fillStyle = '#FFFFFF'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL(type, 0.85)
    // Free the canvas right away: iPhones cap total canvas memory, and once it is used up every further
    // photo comes back empty.
    canvas.width = 0
    canvas.height = 0
    if (!dataUrl.startsWith(`data:${type}`)) throw new Error('could not encode image')
    return dataUrl
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    img.src = ''
  }
}

function decodeImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not decode image: ${src.slice(0, 80)}`))
    img.src = src
  })
}

async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++])
  })
  await Promise.all(workers)
}

function formatPdfDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

function reportFileBaseName(report: Report) {
  const parts = ['דוח', report.details.reportNumber, report.details.address, report.details.apartment && `דירה ${report.details.apartment}`]
  return safeFileName(parts.filter(Boolean).join(' ')) || 'דוח'
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function videoExtension(item: MediaItem) {
  const fromName = /\.([a-zA-Z0-9]{2,5})$/.exec(item.name)?.[1]
  const fromPath = /\.([a-zA-Z0-9]{2,5})$/.exec(item.storagePath ?? '')?.[1]
  return (fromName || fromPath || 'mp4').toLowerCase()
}

function uniqueName(used: Set<string>, base: string, extension: string) {
  let name = `${base || 'סרטון'}.${extension}`
  for (let n = 2; used.has(name); n += 1) name = `${base || 'סרטון'} (${n}).${extension}`
  used.add(name)
  return name
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before releasing the file from memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
