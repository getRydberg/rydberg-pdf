import { useEffect, useRef, useState } from 'react'
import { GripHorizontal } from 'lucide-react'
import type { Annot, PageRef, Tool } from '../lib/types'
import { isPlaced } from '../lib/types'
import { renderPage, type RenderDoc } from '../lib/render'
import { displaySize, rectFromDrag } from '../lib/geometry'
import { LINE_HEIGHT } from '../lib/save'
import { measureText } from '../lib/text'
import type { Style } from '../lib/style'
import { uid } from '../lib/id'

export interface PendingImage {
  dataUrl: string
  mime: 'image/png' | 'image/jpeg'
  w: number
  h: number
}

interface Props {
  doc: RenderDoc | undefined
  page: PageRef
  size: { w: number; h: number } | undefined
  scale: number
  tool: Tool
  style: Style
  annots: Annot[]
  selectedId: string | null
  pendingImage: PendingImage | null
  onSelect: (id: string | null) => void
  onBegin: () => void
  onEnd: () => void
  /** Abandon the current interaction and restore the pre-drag state. */
  onCancel: () => void
  onAdd: (a: Annot) => void
  onPatch: (id: string, patch: Partial<Annot>) => void
  onImagePlaced: () => void
}

type Drag =
  | { mode: 'create-box'; id: string; ax: number; ay: number }
  | { mode: 'create-ink'; id: string; points: { x: number; y: number }[] }
  | { mode: 'move'; id: string; dx: number; dy: number; origin: Annot }
  | { mode: 'resize'; id: string; ax: number; ay: number; origin: Annot }
  | null

const MIN_SIZE = 4

/** Bounding box of any annotation, in display points. */
function bbox(a: Annot) {
  if (a.type === 'ink') {
    const xs = a.points.map((p) => p.x)
    const ys = a.points.map((p) => p.y)
    const pad = a.width / 2
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + a.width,
      h: Math.max(...ys) - Math.min(...ys) + a.width,
    }
  }
  if (a.type === 'text') {
    const m = measureText(a.text || ' ', a.size)
    return { x: a.x, y: a.y, w: m.width, h: m.height }
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h }
}

export function PageCanvas(props: Props) {
  const { page, size, scale, tool, style } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const shown = size ? displaySize(size.w, size.h, page.rotation) : { w: 612, h: 792 }
  const width = shown.w * scale
  const height = shown.h * scale

  useEffect(() => {
    if (!props.doc || !size || !canvasRef.current) return
    const task = renderPage(props.doc, page.index, canvasRef.current, {
      scale,
      rotation: page.rotation,
    })
    return () => task.cancel()
  }, [props.doc, page.index, page.rotation, scale, size])

  // Leaving the select tool ends any in-progress text editing.
  useEffect(() => {
    if (tool !== 'select' && tool !== 'text') setEditingId(null)
  }, [tool])

  function pointAt(e: React.PointerEvent): { x: number; y: number } {
    const rect = surfaceRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    }
  }

  function clamp(v: number, max: number) {
    return Math.max(0, Math.min(max, v))
  }

  function capture(e: React.PointerEvent) {
    surfaceRef.current?.setPointerCapture(e.pointerId)
  }

  function onSurfaceDown(e: React.PointerEvent) {
    // Only react to presses on the page itself, not on an annotation.
    if (e.target !== e.currentTarget && e.target !== canvasRef.current) return
    const p = pointAt(e)
    setEditingId(null)

    if (props.pendingImage) {
      const img = props.pendingImage
      const maxW = Math.min(shown.w * 0.5, 260)
      const w = Math.min(img.w, maxW)
      const h = (img.h / img.w) * w
      const id = uid('img')
      props.onBegin()
      props.onAdd({
        id,
        page: page.id,
        type: 'image',
        x: clamp(p.x - w / 2, shown.w - w),
        y: clamp(p.y - h / 2, shown.h - h),
        w,
        h,
        dataUrl: img.dataUrl,
        mime: img.mime,
      })
      props.onEnd()
      props.onSelect(id)
      props.onImagePlaced()
      return
    }

    switch (tool) {
      case 'select':
        props.onSelect(null)
        break

      case 'text': {
        const id = uid('txt')
        props.onBegin()
        props.onAdd({
          id,
          page: page.id,
          type: 'text',
          x: p.x,
          y: p.y - style.size * 0.5,
          text: '',
          size: style.size,
          color: style.color,
        })
        props.onEnd()
        props.onSelect(id)
        setEditingId(id)
        break
      }

      case 'rect':
      case 'highlight': {
        const id = uid('box')
        props.onBegin()
        props.onAdd({
          id,
          page: page.id,
          type: tool,
          x: p.x,
          y: p.y,
          w: 0,
          h: 0,
          color: style.color,
          opacity: style.opacity,
        })
        props.onSelect(id)
        dragRef.current = { mode: 'create-box', id, ax: p.x, ay: p.y }
        capture(e)
        break
      }

      case 'ink': {
        const id = uid('ink')
        props.onBegin()
        props.onAdd({
          id,
          page: page.id,
          type: 'ink',
          points: [p],
          color: style.color,
          width: style.width,
        })
        props.onSelect(id)
        dragRef.current = { mode: 'create-ink', id, points: [p] }
        capture(e)
        break
      }

      case 'image':
        // Waiting on a file — the toolbar opens the picker.
        break
    }
  }

  function onMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const p = pointAt(e)

    switch (d.mode) {
      case 'create-box': {
        const r = rectFromDrag(d.ax, d.ay, clamp(p.x, shown.w), clamp(p.y, shown.h))
        props.onPatch(d.id, r)
        break
      }
      case 'create-ink': {
        const last = d.points[d.points.length - 1]
        if (Math.hypot(p.x - last.x, p.y - last.y) < 1) return
        d.points = [...d.points, p]
        props.onPatch(d.id, { points: d.points })
        break
      }
      case 'move': {
        const o = d.origin
        const nx = p.x - d.dx
        const ny = p.y - d.dy
        if (o.type === 'ink') {
          const base = bbox(o)
          const offX = nx - base.x
          const offY = ny - base.y
          props.onPatch(d.id, {
            points: o.points.map((pt) => ({ x: pt.x + offX, y: pt.y + offY })),
          })
        } else {
          const b = bbox(o)
          props.onPatch(d.id, {
            x: clamp(nx, shown.w - b.w),
            y: clamp(ny, shown.h - b.h),
          })
        }
        break
      }
      case 'resize': {
        const o = d.origin
        if (o.type === 'text') {
          // Text resizes by font size, driven from its own corner drag.
          const grow = (p.x - d.ax) / Math.max(bbox(o).w, 1)
          props.onPatch(d.id, {
            size: Math.max(6, Math.min(200, Math.round(o.size * (1 + grow)))),
          })
        } else if (isPlaced(o)) {
          const w = Math.max(MIN_SIZE, clamp(p.x, shown.w) - o.x)
          const h = Math.max(MIN_SIZE, clamp(p.y, shown.h) - o.y)
          if (o.type === 'image' && !e.shiftKey) {
            // Images keep their aspect ratio unless you hold Shift.
            const ratio = o.h / o.w
            props.onPatch(d.id, { w, h: w * ratio })
          } else {
            props.onPatch(d.id, { w, h })
          }
        }
        break
      }
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    surfaceRef.current?.releasePointerCapture(e.pointerId)

    // A click without a drag leaves an empty husk — a zero-size box or a
    // single-point stroke. Roll the whole interaction back instead.
    const a = props.annots.find((x) => x.id === d.id)
    const husk =
      (d.mode === 'create-box' && a && isPlaced(a) && (a.w < MIN_SIZE || a.h < MIN_SIZE)) ||
      (d.mode === 'create-ink' && a?.type === 'ink' && a.points.length < 2)
    if (husk) {
      props.onCancel()
      props.onSelect(null)
      return
    }
    props.onEnd()
  }

  function startMove(e: React.PointerEvent, a: Annot) {
    if (tool !== 'select') return
    e.stopPropagation()
    props.onSelect(a.id)
    const p = pointAt(e)
    const b = bbox(a)
    props.onBegin()
    dragRef.current = { mode: 'move', id: a.id, dx: p.x - b.x, dy: p.y - b.y, origin: a }
    capture(e)
  }

  function startResize(e: React.PointerEvent, a: Annot) {
    e.stopPropagation()
    props.onSelect(a.id)
    const p = pointAt(e)
    props.onBegin()
    dragRef.current = { mode: 'resize', id: a.id, ax: p.x, ay: p.y, origin: a }
    capture(e)
  }

  const cursor =
    props.pendingImage || tool === 'text'
      ? 'crosshair'
      : tool === 'rect' || tool === 'highlight' || tool === 'ink'
        ? 'crosshair'
        : 'default'

  return (
    <div
      ref={surfaceRef}
      onPointerDown={onSurfaceDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ width, height, cursor, touchAction: 'none' }}
      className="relative select-none bg-white paper-shadow"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Ink lives in one SVG whose user units are PDF points. */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${shown.w} ${shown.h}`}
        className="pointer-events-none absolute inset-0"
      >
        {props.annots
          .filter((a) => a.type === 'ink')
          .map((a) =>
            a.type === 'ink' && a.points.length > 1 ? (
              <polyline
                key={a.id}
                points={a.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={a.color}
                strokeWidth={a.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}
      </svg>

      {props.annots.map((a) => {
        const selected = a.id === props.selectedId
        const b = bbox(a)
        const common = {
          left: b.x * scale,
          top: b.y * scale,
          width: b.w * scale,
          height: b.h * scale,
        }
        const ring = selected ? '0 0 0 1.5px var(--primary)' : undefined

        if (a.type === 'ink') {
          // The stroke itself is drawn in the SVG above; this is just its
          // hit area and selection frame.
          return (
            <div
              key={a.id}
              onPointerDown={(e) => startMove(e, a)}
              style={{ ...common, boxShadow: ring, cursor: tool === 'select' ? 'move' : cursor }}
              className={`absolute ${tool === 'select' ? '' : 'pointer-events-none'}`}
            />
          )
        }

        if (a.type === 'image') {
          return (
            <div
              key={a.id}
              onPointerDown={(e) => startMove(e, a)}
              style={{ ...common, boxShadow: ring, cursor: tool === 'select' ? 'move' : cursor }}
              className={`absolute ${tool === 'select' ? '' : 'pointer-events-none'}`}
            >
              <img src={a.dataUrl} alt="" draggable={false} className="h-full w-full" />
              {selected && <Handle onPointerDown={(e) => startResize(e, a)} />}
            </div>
          )
        }

        if (a.type === 'text') {
          const editing = editingId === a.id
          return (
            <div
              key={a.id}
              style={{ ...common, boxShadow: ring }}
              className={`absolute ${tool === 'select' || editing ? '' : 'pointer-events-none'}`}
            >
              <textarea
                value={a.text}
                readOnly={!editing}
                spellCheck={false}
                onPointerDown={(e) => {
                  if (editing) {
                    e.stopPropagation() // let the caret land where you clicked
                    return
                  }
                  startMove(e, a)
                }}
                onDoubleClick={() => {
                  props.onSelect(a.id)
                  setEditingId(a.id)
                }}
                onChange={(e) => props.onPatch(a.id, { text: e.target.value })}
                onBlur={() => setEditingId((cur) => (cur === a.id ? null : cur))}
                ref={(el) => {
                  if (el && editing && document.activeElement !== el) el.focus()
                }}
                style={{
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: a.size * scale,
                  lineHeight: `${a.size * LINE_HEIGHT * scale}px`,
                  color: a.color,
                  cursor: editing ? 'text' : tool === 'select' ? 'move' : 'inherit',
                }}
                className="h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none"
              />
              {selected && !editing && (
                <>
                  <button
                    onPointerDown={(e) => startMove(e, a)}
                    onDoubleClick={() => setEditingId(a.id)}
                    title="Drag to move, double-click to edit"
                    className="absolute -top-5 left-0 flex h-4 items-center rounded-sm bg-primary px-1 text-primary-foreground"
                  >
                    <GripHorizontal className="h-3 w-3" />
                  </button>
                  <Handle onPointerDown={(e) => startResize(e, a)} />
                </>
              )}
            </div>
          )
        }

        // rect / highlight
        return (
          <div
            key={a.id}
            onPointerDown={(e) => startMove(e, a)}
            style={{
              ...common,
              background: a.color,
              opacity: a.opacity,
              boxShadow: ring,
              cursor: tool === 'select' ? 'move' : cursor,
            }}
            className={`absolute ${tool === 'select' ? '' : 'pointer-events-none'}`}
          >
            {selected && <Handle onPointerDown={(e) => startResize(e, a)} />}
          </div>
        )
      })}
    </div>
  )
}

function Handle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to resize"
      style={{ cursor: 'nwse-resize' }}
      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm border border-white bg-[var(--primary)]"
    />
  )
}
