import { Copy, Trash2 } from 'lucide-react'
import type { Annot } from '../lib/types'
import { SWATCHES } from '../lib/style'

interface Props {
  annot: Annot
  onPatch: (id: string, patch: Partial<Annot>) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

const LABELS: Record<Annot['type'], string> = {
  text: 'Text',
  rect: 'Box',
  highlight: 'Highlight',
  ink: 'Drawing',
  image: 'Image',
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function Inspector({ annot, onPatch, onDuplicate, onDelete }: Props) {
  const slider =
    'w-full accent-[var(--primary)]'

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-xs">
        <span className="text-muted-foreground">Selected</span>
        <span className="text-foreground">{LABELS[annot.type]}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {annot.type !== 'image' && (
          <Row label="Color">
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => onPatch(annot.id, { color: c } as Partial<Annot>)}
                  style={{ background: c }}
                  className={`h-6 w-6 rounded-full border transition-transform ${
                    annot.color.toLowerCase() === c.toLowerCase()
                      ? 'border-foreground scale-110'
                      : 'border-border hover:scale-110'
                  }`}
                />
              ))}
            </div>
          </Row>
        )}

        {annot.type === 'text' && (
          <>
            <Row label={`Font size — ${annot.size}pt`}>
              <input
                type="range"
                min={6}
                max={96}
                value={annot.size}
                onChange={(e) => onPatch(annot.id, { size: Number(e.target.value) })}
                className={slider}
              />
            </Row>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              Double-click the text to edit it. Helvetica is the only font
              embedded — see the README for why.
            </p>
          </>
        )}

        {annot.type === 'ink' && (
          <Row label={`Stroke width — ${annot.width}pt`}>
            <input
              type="range"
              min={1}
              max={12}
              value={annot.width}
              onChange={(e) => onPatch(annot.id, { width: Number(e.target.value) })}
              className={slider}
            />
          </Row>
        )}

        {(annot.type === 'rect' || annot.type === 'highlight') && (
          <>
            <Row label={`Opacity — ${Math.round(annot.opacity * 100)}%`}>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(annot.opacity * 100)}
                onChange={(e) => onPatch(annot.id, { opacity: Number(e.target.value) / 100 })}
                className={slider}
              />
            </Row>
            <Row label="Size (points)">
              <div className="grid grid-cols-2 gap-2">
                {(['w', 'h'] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    min={1}
                    value={Math.round(annot[k])}
                    onChange={(e) =>
                      onPatch(annot.id, { [k]: Math.max(1, Number(e.target.value)) } as Partial<Annot>)
                    }
                    className="w-full rounded-md border border-border bg-input px-2 py-1 font-mono text-sm outline-none focus:border-primary"
                  />
                ))}
              </div>
            </Row>
          </>
        )}

        {annot.type === 'image' && (
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Drag the corner to resize. Hold Shift while dragging to stretch it
            out of its original aspect ratio.
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <button
          onClick={() => onDuplicate(annot.id)}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary text-sm text-foreground hover:brightness-125"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button
          onClick={() => onDelete(annot.id)}
          title="Delete (Del)"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-secondary px-3 text-sm text-destructive hover:brightness-125"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
