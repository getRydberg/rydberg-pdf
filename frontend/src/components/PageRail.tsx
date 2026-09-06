import { useEffect, useRef, useState } from 'react'
import { Copy, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import type { PageRef } from '../lib/types'
import { renderPage, type RenderDoc } from '../lib/render'
import { displaySize } from '../lib/geometry'

const THUMB_W = 128

function Thumb({
  doc,
  page,
  size,
}: {
  doc: RenderDoc | undefined
  page: PageRef
  size: { w: number; h: number } | undefined
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!doc || !size || !ref.current) return
    const shown = displaySize(size.w, size.h, page.rotation)
    const task = renderPage(doc, page.index, ref.current, {
      scale: THUMB_W / shown.w,
      rotation: page.rotation,
    })
    return () => task.cancel()
  }, [doc, page.index, page.rotation, size])

  const shown = size ? displaySize(size.w, size.h, page.rotation) : null
  const height = shown ? Math.round((THUMB_W * shown.h) / shown.w) : 165

  return (
    <canvas
      ref={ref}
      style={{ width: THUMB_W, height }}
      className="block bg-white"
    />
  )
}

interface Props {
  pages: PageRef[]
  docs: Record<string, RenderDoc>
  sizes: Record<string, { w: number; h: number }>
  currentId: string | null
  annotCounts: Record<string, number>
  onSelect: (id: string) => void
  onReorder: (from: number, to: number) => void
  onRotate: (id: string, delta: number) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

export function PageRail(props: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  return (
    <aside className="flex w-[184px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs text-muted-foreground">
        <span>Pages</span>
        <span className="font-mono">{props.pages.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {props.pages.map((page, i) => {
          const active = page.id === props.currentId
          const marks = props.annotCounts[page.id] ?? 0
          return (
            <div
              key={page.id}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => {
                setDragFrom(null)
                setDropAt(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragFrom !== null && dropAt !== i) setDropAt(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragFrom !== null && dragFrom !== i) props.onReorder(dragFrom, i)
                setDragFrom(null)
                setDropAt(null)
              }}
              onClick={() => props.onSelect(page.id)}
              className={`group relative mb-3 cursor-pointer rounded-md ${
                dropAt === i && dragFrom !== null && dragFrom !== i
                  ? 'ring-2 ring-accent'
                  : ''
              } ${dragFrom === i ? 'opacity-40' : ''}`}
            >
              <div
                className={`overflow-hidden rounded-md border transition-colors ${
                  active ? 'border-primary' : 'border-border group-hover:border-muted-foreground'
                }`}
              >
                <Thumb
                  doc={props.docs[page.src]}
                  page={page}
                  size={props.sizes[`${page.src}:${page.index}`]}
                />
              </div>

              <div className="mt-1 flex items-center justify-between px-0.5 text-[11px]">
                <span className={`font-mono ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {i + 1}
                </span>
                {marks > 0 && (
                  <span className="rounded-sm bg-accent/20 px-1 font-mono text-accent" title={`${marks} edits on this page`}>
                    {marks}
                  </span>
                )}
              </div>

              {/* Per-page actions — only on hover, so the rail stays readable. */}
              <div className="absolute inset-x-0 bottom-6 flex justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-0.5 rounded-md border border-border bg-popover/95 p-0.5 backdrop-blur">
                  {[
                    { icon: RotateCcw, title: 'Rotate left', run: () => props.onRotate(page.id, -90) },
                    { icon: RotateCw, title: 'Rotate right', run: () => props.onRotate(page.id, 90) },
                    { icon: Copy, title: 'Duplicate page', run: () => props.onDuplicate(page.id) },
                    { icon: Trash2, title: 'Delete page', run: () => props.onDelete(page.id) },
                  ].map((a) => (
                    <button
                      key={a.title}
                      title={a.title}
                      onClick={(e) => {
                        e.stopPropagation()
                        a.run()
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <a.icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
