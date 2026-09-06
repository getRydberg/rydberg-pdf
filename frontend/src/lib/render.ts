/**
 * Everything that touches pdf.js. pdf.js is used for *display only* — the
 * actual editing is done with pdf-lib in `save.ts`. Keeping the two apart
 * matters: pdf.js detaches any ArrayBuffer you hand it, so the original
 * bytes are always copied before rendering.
 */

import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type RenderDoc = PDFDocumentProxy

export async function openDocument(bytes: Uint8Array): Promise<RenderDoc> {
  // .slice() — pdf.js takes ownership of the buffer it's given.
  return await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, maxImageSize: 16_000_000 }).promise
}

/** Unrotated page size in points, plus the page's own baked-in rotation. */
export async function pageMetrics(doc: RenderDoc, index: number) {
  const page = await doc.getPage(index + 1)
  const v = page.getViewport({ scale: 1, rotation: 0 })
  return { w: v.width, h: v.height, rotation: page.rotate }
}

export interface RenderTask {
  cancel(): void
}

/**
 * Draw a page into a canvas at `scale` CSS px per point, honouring the
 * device pixel ratio so text stays crisp on retina displays. Returns a
 * handle so an in-flight render can be cancelled when the user scrolls or
 * zooms away — pdf.js throws if two renders share a canvas.
 */
export function renderPage(
  doc: RenderDoc,
  index: number,
  canvas: HTMLCanvasElement,
  opts: { scale: number; rotation: number },
): RenderTask {
  let cancelled = false
  let task: { cancel(): void } | null = null

  ;(async () => {
    const page = await doc.getPage(index + 1)
    if (cancelled) return

    const viewport = page.getViewport({
      scale: opts.scale,
      rotation: opts.rotation,
    })
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx || cancelled) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewport.width, viewport.height)

    const t = page.render({ canvasContext: ctx, viewport })
    task = t
    try {
      await t.promise
    } catch {
      // Cancellation lands here; nothing to report.
    }
  })()

  return {
    cancel() {
      cancelled = true
      task?.cancel()
    },
  }
}
