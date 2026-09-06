/**
 * Building the output file. Everything that touches pdf-lib lives here.
 *
 * Annotations are *flattened* into each page's content stream rather than
 * written as PDF annotation objects. That means what you see is what every
 * reader shows — nothing can be clicked away, moved, or silently hidden by
 * a viewer that doesn't support a given annotation subtype. The trade-off
 * is that a saved file can't be re-opened here and re-edited annotation by
 * annotation; it's a new document.
 */

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import type { Annot, Doc, Source } from './types'
import { boxAnchor, contentAngle, hexToRgb, toPdfPoint } from './geometry'

export const LINE_HEIGHT = 1.2
/** Where a line's baseline sits below its top edge, as a fraction of size. */
const BASELINE = 0.8

/** Standard fonts are WinAnsi-encoded; anything else makes pdf-lib throw. */
function sanitize(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?')
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function drawAnnot(
  out: PDFDocument,
  page: PDFPage,
  annot: Annot,
  rotation: number,
  font: PDFFont,
) {
  // getSize() is the unrotated media box — exactly what geometry.ts wants.
  const { width: W, height: H } = page.getSize()
  const angle = degrees(contentAngle(rotation))
  const color = hexToRgb('color' in annot ? annot.color : '#000000')

  switch (annot.type) {
    case 'text': {
      const lines = sanitize(annot.text).split('\n')
      lines.forEach((line, i) => {
        if (!line) return
        const dy = annot.y + annot.size * BASELINE + i * annot.size * LINE_HEIGHT
        const p = toPdfPoint(annot.x, dy, W, H, rotation)
        page.drawText(line, {
          x: p.x,
          y: p.y,
          size: annot.size,
          font,
          color: rgb(color.r, color.g, color.b),
          rotate: angle,
        })
      })
      break
    }

    case 'rect':
    case 'highlight': {
      const p = boxAnchor(annot.x, annot.y, annot.h, W, H, rotation)
      page.drawRectangle({
        x: p.x,
        y: p.y,
        width: annot.w,
        height: annot.h,
        rotate: angle,
        color: rgb(color.r, color.g, color.b),
        opacity: annot.opacity,
      })
      break
    }

    case 'ink': {
      for (let i = 1; i < annot.points.length; i += 1) {
        const a = annot.points[i - 1]
        const b = annot.points[i]
        page.drawLine({
          start: toPdfPoint(a.x, a.y, W, H, rotation),
          end: toPdfPoint(b.x, b.y, W, H, rotation),
          thickness: annot.width,
          color: rgb(color.r, color.g, color.b),
          lineCap: 1, // round — otherwise fast strokes look like dashes
        })
      }
      break
    }

    case 'image': {
      const bytes = dataUrlToBytes(annot.dataUrl)
      const img =
        annot.mime === 'image/png'
          ? await out.embedPng(bytes)
          : await out.embedJpg(bytes)
      const p = boxAnchor(annot.x, annot.y, annot.h, W, H, rotation)
      page.drawImage(img, {
        x: p.x,
        y: p.y,
        width: annot.w,
        height: annot.h,
        rotate: angle,
      })
      break
    }
  }
}

/**
 * Assemble the edited document: pages in their current order and rotation,
 * pulled from whichever source file each one came from, with annotations
 * painted on top.
 */
export async function buildPdf(
  doc: Doc,
  sources: Record<string, Source>,
): Promise<Uint8Array> {
  if (doc.pages.length === 0) throw new Error('Nothing to save — no pages.')

  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)

  // Copy per source in one call, keeping repeats so a duplicated page really
  // does become two independent pages.
  const indicesBySource: Record<string, number[]> = {}
  for (const p of doc.pages) {
    ;(indicesBySource[p.src] ||= []).push(p.index)
  }

  const copied: Record<string, PDFPage[]> = {}
  for (const [srcId, indices] of Object.entries(indicesBySource)) {
    const source = sources[srcId]
    if (!source) throw new Error(`Missing source file for ${srcId}`)
    const srcDoc = await PDFDocument.load(source.bytes.slice(), {
      ignoreEncryption: true,
    })
    copied[srcId] = await out.copyPages(srcDoc, indices)
  }

  const cursor: Record<string, number> = {}
  for (const ref of doc.pages) {
    const i = (cursor[ref.src] ||= 0)
    cursor[ref.src] = i + 1
    const page = copied[ref.src][i]
    page.setRotation(degrees(ref.rotation))
    out.addPage(page)
  }

  const byPage: Record<string, Annot[]> = {}
  for (const a of doc.annots) (byPage[a.page] ||= []).push(a)

  for (let i = 0; i < doc.pages.length; i += 1) {
    const ref = doc.pages[i]
    const annots = byPage[ref.id]
    if (!annots?.length) continue
    const page = out.getPage(i)
    for (const a of annots) {
      await drawAnnot(out, page, a, ref.rotation, font)
    }
  }

  return await out.save()
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  // Copy into a fresh buffer so the Blob owns plain ArrayBuffer-backed bytes.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the download a tick to start before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function outputName(sourceName: string): string {
  const base = sourceName.replace(/\.pdf$/i, '')
  return `${base}-edited.pdf`
}
