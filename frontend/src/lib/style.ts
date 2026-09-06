/** The "current brush": what a newly created annotation inherits. */
export interface Style {
  color: string
  size: number
  width: number
  opacity: number
}

export const DEFAULT_STYLE: Style = {
  color: '#111827',
  size: 14,
  width: 2,
  opacity: 0.35,
}

export const SWATCHES = [
  '#111827', // near-black, for text
  '#ffffff', // white, for covering things up
  '#e11d48', // red
  '#f5a623', // amber — the Rydberg accent
  '#facc15', // highlighter yellow
  '#22c55e', // green
  '#4d9ef6', // Rydberg blue
]

/** Sensible per-tool defaults, applied when you switch tools. */
export function toolDefaults(tool: string): Partial<Style> {
  if (tool === 'highlight') return { color: '#facc15', opacity: 0.35 }
  if (tool === 'rect') return { color: '#111827', opacity: 1 }
  if (tool === 'ink') return { color: '#111827' }
  if (tool === 'text') return { color: '#111827' }
  return {}
}
