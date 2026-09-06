import {
  Download,
  FileText,
  FolderOpen,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Tool } from '../lib/types'
import type { Style } from '../lib/style'
import { SWATCHES } from '../lib/style'

interface Props {
  fileName: string | null
  pageCount: number
  tool: Tool
  onTool: (t: Tool) => void
  style: Style
  onStyle: (patch: Partial<Style>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onOpen: () => void
  onInsert: () => void
  onSave: () => void
  saving: boolean
  zoom: number
  fitting: boolean
  onZoom: (z: number | 'fit') => void
}

const TOOLS: { id: Tool; label: string; icon: typeof Type; hint: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'V — move and resize what you added' },
  { id: 'text', label: 'Text', icon: Type, hint: 'T — click the page to type' },
  { id: 'rect', label: 'Box', icon: Square, hint: 'R — drag a filled box (cover something up)' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, hint: 'H — drag a translucent marker' },
  { id: 'ink', label: 'Draw', icon: PenLine, hint: 'D — freehand, for signatures' },
  { id: 'image', label: 'Image', icon: ImageIcon, hint: 'I — place a PNG or JPEG' },
]

function Btn({
  children,
  onClick,
  title,
  disabled,
  active,
  primary,
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
  active?: boolean
  primary?: boolean
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-sm transition-colors disabled:opacity-35 disabled:cursor-not-allowed'
  const tone = primary
    ? 'bg-primary text-primary-foreground hover:brightness-110'
    : active
      ? 'bg-secondary text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
  return (
    <button className={`${base} ${tone}`} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  )
}

export function Toolbar(props: Props) {
  const { style, onStyle, tool } = props
  const showColor = tool !== 'select' && tool !== 'image'

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="flex items-center gap-2 pr-3">
          <FileText className="h-5 w-5 text-primary" />
          <span className="font-medium tracking-tight">Rydberg PDF</span>
        </div>

        <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {props.fileName ? (
            <>
              <span className="text-foreground">{props.fileName}</span>
              <span className="mx-2 text-border">·</span>
              <span className="font-mono">{props.pageCount} pages</span>
            </>
          ) : (
            'No file open'
          )}
        </div>

        <Btn onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Btn>

        <div className="mx-1 h-6 w-px bg-border" />

        <Btn onClick={props.onOpen} title="Open a PDF (replaces what's open)">
          <FolderOpen className="h-4 w-4" />
          Open
        </Btn>
        <Btn onClick={props.onInsert} disabled={!props.pageCount} title="Append pages from another PDF">
          <Plus className="h-4 w-4" />
          Insert pages
        </Btn>
        <Btn onClick={props.onSave} disabled={!props.pageCount || props.saving} primary title="Save a new PDF (Ctrl+S)">
          {props.saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Save
        </Btn>
      </div>

      <div className="flex h-11 items-center gap-1 border-t border-border px-4">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.hint}
            onClick={() => props.onTool(t.id)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
              props.tool === t.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}

        {showColor && (
          <>
            <div className="mx-2 h-6 w-px bg-border" />
            <div className="flex items-center gap-1">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => onStyle({ color: c })}
                  style={{ background: c }}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    style.color.toLowerCase() === c.toLowerCase()
                      ? 'border-foreground scale-110'
                      : 'border-border hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {tool === 'text' && (
          <label className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
            Size
            <input
              type="range"
              min={6}
              max={72}
              value={style.size}
              onChange={(e) => onStyle({ size: Number(e.target.value) })}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="w-6 font-mono text-foreground">{style.size}</span>
          </label>
        )}

        {tool === 'ink' && (
          <label className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
            Width
            <input
              type="range"
              min={1}
              max={12}
              value={style.width}
              onChange={(e) => onStyle({ width: Number(e.target.value) })}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="w-6 font-mono text-foreground">{style.width}</span>
          </label>
        )}

        {(tool === 'rect' || tool === 'highlight') && (
          <label className="ml-3 flex items-center gap-2 text-xs text-muted-foreground">
            Opacity
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(style.opacity * 100)}
              onChange={(e) => onStyle({ opacity: Number(e.target.value) / 100 })}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="w-8 font-mono text-foreground">
              {Math.round(style.opacity * 100)}%
            </span>
          </label>
        )}

        <div className="flex-1" />

        <Btn onClick={() => props.onZoom(Math.max(0.25, props.zoom - 0.25))} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Btn>
        <button
          onClick={() => props.onZoom('fit')}
          title="Fit to window"
          className={`h-8 min-w-16 rounded-md px-2 font-mono text-xs transition-colors ${
            props.fitting
              ? 'bg-secondary text-primary'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          {props.fitting ? 'Fit' : `${Math.round(props.zoom * 100)}%`}
        </button>
        <Btn onClick={() => props.onZoom(Math.min(5, props.zoom + 0.25))} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Btn>
      </div>
    </header>
  )
}
