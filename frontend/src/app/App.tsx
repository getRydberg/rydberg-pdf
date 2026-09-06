import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Loader2,
  X,
} from 'lucide-react'
import { Toolbar } from '../components/Toolbar'
import { PageRail } from '../components/PageRail'
import { PageCanvas, type PendingImage } from '../components/PageCanvas'
import { Inspector } from '../components/Inspector'
import { EMPTY_DOC, type Annot, type Doc, type PageRef, type Source, type Tool } from '../lib/types'
import { openDocument, pageMetrics, type RenderDoc } from '../lib/render'
import { displaySize, normalizeRotation } from '../lib/geometry'
import { buildPdf, downloadPdf, outputName } from '../lib/save'
import { DEFAULT_STYLE, toolDefaults, type Style } from '../lib/style'
import { uid } from '../lib/id'

export default function App() {
  const [sources, setSources] = useState<Record<string, Source>>({})
  const [docs, setDocs] = useState<Record<string, RenderDoc>>({})
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})

  const [doc, setDoc] = useState<Doc>(EMPTY_DOC)
  const docRef = useRef(doc)
  docRef.current = doc

  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const snapshot = useRef<Doc | null>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setToolState] = useState<Tool>('select')
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  const [zoom, setZoomValue] = useState(1)
  const [fitting, setFitting] = useState(true)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  const pdfInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const insertMode = useRef<'replace' | 'append'>('replace')
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── History ────────────────────────────────────────────────────────────

  const commit = useCallback((next: Doc) => {
    setPast((p) => [...p.slice(-49), docRef.current])
    setFuture([])
    setDoc(next)
  }, [])

  /** Take a snapshot before a drag; `endEdit` turns it into a history entry. */
  const beginEdit = useCallback(() => {
    snapshot.current = docRef.current
  }, [])

  const endEdit = useCallback(() => {
    const before = snapshot.current
    snapshot.current = null
    if (before && before !== docRef.current) {
      setPast((p) => [...p.slice(-49), before])
      setFuture([])
    }
  }, [])

  const cancelEdit = useCallback(() => {
    const before = snapshot.current
    snapshot.current = null
    if (before) setDoc(before)
  }, [])

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [docRef.current, ...f])
      setDoc(prev)
      return p.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      setPast((p) => [...p, docRef.current])
      setDoc(f[0])
      return f.slice(1)
    })
  }, [])

  // ── Opening files ──────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (list: FileList | File[], mode: 'replace' | 'append') => {
      const files = Array.from(list).filter(
        (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
      )
      if (!files.length) {
        setError('Only PDF files can be opened here.')
        return
      }

      setLoading(true)
      setError(null)
      try {
        const nextSources: Record<string, Source> = {}
        const nextDocs: Record<string, RenderDoc> = {}
        const nextSizes: Record<string, { w: number; h: number }> = {}
        const nextPages: PageRef[] = []

        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const srcId = uid('src')
          const rdoc = await openDocument(bytes)
          nextSources[srcId] = { id: srcId, name: file.name, bytes }
          nextDocs[srcId] = rdoc
          for (let i = 0; i < rdoc.numPages; i += 1) {
            const m = await pageMetrics(rdoc, i)
            nextSizes[`${srcId}:${i}`] = { w: m.w, h: m.h }
            nextPages.push({
              id: uid('pg'),
              src: srcId,
              index: i,
              rotation: normalizeRotation(m.rotation),
            })
          }
        }

        setSources((s) => (mode === 'replace' ? nextSources : { ...s, ...nextSources }))
        setDocs((d) => (mode === 'replace' ? nextDocs : { ...d, ...nextDocs }))
        setSizes((s) => (mode === 'replace' ? nextSizes : { ...s, ...nextSizes }))

        if (mode === 'replace') {
          setDoc({ pages: nextPages, annots: [] })
          setPast([])
          setFuture([])
          setFileName(files[0].name)
          setCurrentId(nextPages[0]?.id ?? null)
          setSelectedId(null)
        } else {
          commit({
            pages: [...docRef.current.pages, ...nextPages],
            annots: docRef.current.annots,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          /password/i.test(msg)
            ? 'That PDF is password-protected. Remove the password first — this editor never asks for one.'
            : `Could not open that file: ${msg}`,
        )
      } finally {
        setLoading(false)
      }
    },
    [commit],
  )

  function openPicker(mode: 'replace' | 'append') {
    if (mode === 'replace' && doc.pages.length) {
      const ok = window.confirm('Replace the open document? Unsaved edits are lost.')
      if (!ok) return
    }
    insertMode.current = mode
    if (pdfInput.current) {
      pdfInput.current.value = ''
      pdfInput.current.click()
    }
  }

  // ── Page operations ────────────────────────────────────────────────────

  const currentPage = useMemo(
    () => doc.pages.find((p) => p.id === currentId) ?? doc.pages[0] ?? null,
    [doc.pages, currentId],
  )
  const currentIndex = currentPage ? doc.pages.findIndex((p) => p.id === currentPage.id) : -1
  const currentSize = currentPage ? sizes[`${currentPage.src}:${currentPage.index}`] : undefined

  function rotatePage(id: string, delta: number) {
    const page = doc.pages.find((p) => p.id === id)
    const size = page ? sizes[`${page.src}:${page.index}`] : undefined
    if (!page || !size) return
    const shown = displaySize(size.w, size.h, page.rotation)
    const cw = normalizeRotation(delta) === 90

    // Annotations live in the page's *displayed* frame, so rotating the page
    // has to carry them along — otherwise a signature would jump off the
    // corner it was sitting on. They stay upright; only their position turns.
    const move = (x: number, y: number) =>
      cw ? { x: shown.h - y, y: x } : { x: y, y: shown.w - x }

    const annots = doc.annots.map((a): Annot => {
      if (a.page !== id) return a
      if (a.type === 'ink') {
        return { ...a, points: a.points.map((p) => move(p.x, p.y)) }
      }
      if (a.type === 'text') {
        return { ...a, ...move(a.x, a.y) }
      }
      const corner = cw ? move(a.x, a.y + a.h) : move(a.x + a.w, a.y)
      return { ...a, x: corner.x, y: corner.y, w: a.h, h: a.w }
    })

    commit({
      pages: doc.pages.map((p) =>
        p.id === id ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p,
      ),
      annots,
    })
  }

  function deletePage(id: string) {
    const idx = doc.pages.findIndex((p) => p.id === id)
    const pages = doc.pages.filter((p) => p.id !== id)
    commit({ pages, annots: doc.annots.filter((a) => a.page !== id) })
    if (currentId === id) {
      const next = pages[Math.min(idx, pages.length - 1)]
      setCurrentId(next?.id ?? null)
    }
    setSelectedId(null)
  }

  function duplicatePage(id: string) {
    const idx = doc.pages.findIndex((p) => p.id === id)
    if (idx < 0) return
    const copy: PageRef = { ...doc.pages[idx], id: uid('pg') }
    const pages = [...doc.pages]
    pages.splice(idx + 1, 0, copy)
    const carried = doc.annots
      .filter((a) => a.page === id)
      .map((a): Annot => ({ ...a, id: uid('an'), page: copy.id }))
    commit({ pages, annots: [...doc.annots, ...carried] })
  }

  function reorderPages(from: number, to: number) {
    const pages = [...doc.pages]
    const [moved] = pages.splice(from, 1)
    pages.splice(to, 0, moved)
    commit({ pages, annots: doc.annots })
  }

  // ── Annotation operations ──────────────────────────────────────────────

  const addAnnot = useCallback((a: Annot) => {
    setDoc((d) => ({ ...d, annots: [...d.annots, a] }))
  }, [])

  const patchAnnot = useCallback((id: string, patch: Partial<Annot>) => {
    setDoc((d) => ({
      ...d,
      annots: d.annots.map((a) => (a.id === id ? ({ ...a, ...patch } as Annot) : a)),
    }))
  }, [])

  const deleteAnnot = useCallback(
    (id: string) => {
      commit({ ...docRef.current, annots: docRef.current.annots.filter((a) => a.id !== id) })
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    [commit],
  )

  function duplicateAnnot(id: string) {
    const a = doc.annots.find((x) => x.id === id)
    if (!a) return
    const copy: Annot =
      a.type === 'ink'
        ? { ...a, id: uid('an'), points: a.points.map((p) => ({ x: p.x + 12, y: p.y + 12 })) }
        : { ...a, id: uid('an'), x: a.x + 12, y: a.y + 12 }
    commit({ ...doc, annots: [...doc.annots, copy] })
    setSelectedId(copy.id)
  }

  const selected = doc.annots.find((a) => a.id === selectedId) ?? null

  // ── Tools ──────────────────────────────────────────────────────────────

  function setTool(t: Tool) {
    setToolState(t)
    setStyle((s) => ({ ...s, ...toolDefaults(t) }))
    if (t === 'image') {
      if (imageInput.current) {
        imageInput.current.value = ''
        imageInput.current.click()
      }
    } else {
      setPendingImage(null)
    }
  }

  async function onImageChosen(file: File) {
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setError('Images must be PNG or JPEG — those are the formats PDF can embed directly.')
      setToolState('select')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(file)
    })
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => reject(new Error('That image could not be read.'))
      img.src = dataUrl
    })
    setPendingImage({ dataUrl, mime: file.type, ...dims })
  }

  // ── Save ───────────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    if (!docRef.current.pages.length) return
    setSaving(true)
    setError(null)
    try {
      const bytes = await buildPdf(docRef.current, sources)
      downloadPdf(bytes, outputName(fileName ?? 'document.pdf'))
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [sources, fileName])

  // ── Zoom / fit ─────────────────────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setViewport({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fitScale = useMemo(() => {
    if (!currentSize || !currentPage || !viewport.w) return 1
    const shown = displaySize(currentSize.w, currentSize.h, currentPage.rotation)
    const pad = 64
    return Math.max(
      0.1,
      Math.min(4, (viewport.w - pad) / shown.w, (viewport.h - pad) / shown.h),
    )
  }, [currentSize, currentPage, viewport])

  const scale = fitting ? fitScale : zoom

  function setZoom(z: number | 'fit') {
    if (z === 'fit') {
      setFitting(true)
    } else {
      setFitting(false)
      setZoomValue(z)
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  const goto = useCallback(
    (delta: number) => {
      const pages = docRef.current.pages
      if (!pages.length) return
      setCurrentId((cur) => {
        const i = pages.findIndex((p) => p.id === cur)
        const next = Math.max(0, Math.min(pages.length - 1, (i < 0 ? 0 : i) + delta))
        return pages[next].id
      })
      setSelectedId(null)
    },
    [],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (typing) return

      if (e.key === 'Escape') {
        setSelectedId(null)
        setPendingImage(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteAnnot(selectedId)
        return
      }
      if (e.key === 'PageDown') {
        e.preventDefault()
        goto(1)
        return
      }
      if (e.key === 'PageUp') {
        e.preventDefault()
        goto(-1)
        return
      }

      const map: Record<string, Tool> = {
        v: 'select',
        t: 'text',
        r: 'rect',
        h: 'highlight',
        d: 'ink',
        i: 'image',
      }
      const t = map[e.key.toLowerCase()]
      if (t) setTool(t)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // setTool is stable enough for this handler's purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, undo, redo, selectedId, deleteAnnot, goto])

  // ── Render ─────────────────────────────────────────────────────────────

  const annotCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of doc.annots) counts[a.page] = (counts[a.page] ?? 0) + 1
    return counts
  }, [doc.annots])

  const pageAnnots = useMemo(
    () => (currentPage ? doc.annots.filter((a) => a.page === currentPage.id) : []),
    [doc.annots, currentPage],
  )

  const hasDoc = doc.pages.length > 0

  return (
    <div
      className="flex h-full flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        void addFiles(e.dataTransfer.files, hasDoc ? 'append' : 'replace')
      }}
    >
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files, insertMode.current)
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImageChosen(f)
          else setToolState('select')
        }}
      />

      <Toolbar
        fileName={fileName}
        pageCount={doc.pages.length}
        tool={tool}
        onTool={setTool}
        style={style}
        onStyle={(patch) => setStyle((s) => ({ ...s, ...patch }))}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onOpen={() => openPicker('replace')}
        onInsert={() => openPicker('append')}
        onSave={() => void save()}
        saving={saving}
        zoom={scale}
        fitting={fitting}
        onZoom={setZoom}
      />

      {error && (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pendingImage && (
        <div className="border-b border-border bg-primary/10 px-4 py-2 text-sm text-primary">
          Click anywhere on the page to place the image. Press Esc to cancel.
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {hasDoc && (
          <PageRail
            pages={doc.pages}
            docs={docs}
            sizes={sizes}
            currentId={currentPage?.id ?? null}
            annotCounts={annotCounts}
            onSelect={(id) => {
              setCurrentId(id)
              setSelectedId(null)
            }}
            onReorder={reorderPages}
            onRotate={rotatePage}
            onDuplicate={duplicatePage}
            onDelete={deletePage}
          />
        )}

        <section
          ref={scrollRef}
          className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto bg-[var(--background)] p-8"
        >
          {hasDoc && currentPage ? (
            <PageCanvas
              doc={docs[currentPage.src]}
              page={currentPage}
              size={currentSize}
              scale={scale}
              tool={tool}
              style={style}
              annots={pageAnnots}
              selectedId={selectedId}
              pendingImage={pendingImage}
              onSelect={setSelectedId}
              onBegin={beginEdit}
              onEnd={endEdit}
              onCancel={cancelEdit}
              onAdd={addAnnot}
              onPatch={patchAnnot}
              onImagePlaced={() => {
                setPendingImage(null)
                setToolState('select')
              }}
            />
          ) : (
            <EmptyState onOpen={() => openPicker('replace')} loading={loading} />
          )}

          {dropping && (
            <div className="pointer-events-none absolute inset-4 rounded-xl border-2 border-dashed border-primary bg-primary/5" />
          )}
        </section>

        {selected && (
          <Inspector
            annot={selected}
            onPatch={(id, patch) => {
              beginEdit()
              patchAnnot(id, patch)
              // Slider drags fire many changes; each one is its own small
              // history entry, which is what people expect from a panel.
              queueMicrotask(endEdit)
            }}
            onDuplicate={duplicateAnnot}
            onDelete={deleteAnnot}
          />
        )}
      </main>

      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-card px-4 text-xs text-muted-foreground">
        {hasDoc ? (
          <>
            <button
              onClick={() => goto(-1)}
              disabled={currentIndex <= 0}
              className="disabled:opacity-30"
              title="Previous page (PageUp)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono">
              {currentIndex + 1} / {doc.pages.length}
            </span>
            <button
              onClick={() => goto(1)}
              disabled={currentIndex >= doc.pages.length - 1}
              className="disabled:opacity-30"
              title="Next page (PageDown)"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-border">|</span>
            <span>
              Drag thumbnails to reorder · hover one for rotate, duplicate, delete
            </span>
          </>
        ) : (
          <span>Everything happens in this browser tab — no file is ever uploaded.</span>
        )}
        <span className="flex-1" />
        {loading && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading…
          </span>
        )}
        <span className="font-mono">rydberg-pdf</span>
      </footer>
    </div>
  )
}

function EmptyState({ onOpen, loading }: { onOpen: () => void; loading: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <button
        onClick={onOpen}
        className="flex w-[420px] max-w-full flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border px-8 py-14 text-center transition-colors hover:border-primary hover:bg-secondary/40"
      >
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <FileUp className="h-8 w-8 text-primary" />
        )}
        <div>
          <p className="text-foreground">Drop a PDF here, or click to choose one</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reorder, rotate, merge and split pages. Add text, boxes,
            highlights, drawings and signatures. Save a new file.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing leaves this tab — the file is never uploaded anywhere.
        </p>
      </button>
    </div>
  )
}
