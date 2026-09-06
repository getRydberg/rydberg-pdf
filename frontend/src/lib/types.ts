/**
 * The whole editor state is these three things: sources (the bytes of every
 * PDF you've opened), pages (an ordered list of references into those
 * sources), and annots (things you've drawn, each pinned to a page *id* so
 * reordering pages never orphans them).
 *
 * Nothing here is mutated in place — every edit produces a new Doc, which is
 * what makes undo/redo a one-liner.
 */

export type Tool = 'select' | 'text' | 'rect' | 'highlight' | 'ink' | 'image'

export interface Source {
  id: string
  name: string
  bytes: Uint8Array
}

export interface PageRef {
  id: string
  /** Source.id these bytes come from. */
  src: string
  /** 0-based page index within that source. */
  index: number
  /** Absolute display rotation in degrees: 0, 90, 180 or 270. */
  rotation: number
}

interface AnnotBase {
  id: string
  /** PageRef.id, not a page number — pages move. */
  page: string
}

/**
 * All annotation coordinates are in PDF points (1/72") with a top-left
 * origin, in the page's *displayed* (i.e. rotated) frame — the same frame
 * you see on screen. `geometry.ts` maps them back to PDF user space on save.
 */
export interface TextAnnot extends AnnotBase {
  type: 'text'
  x: number
  y: number
  text: string
  size: number
  color: string
}

export interface BoxAnnot extends AnnotBase {
  type: 'rect' | 'highlight'
  x: number
  y: number
  w: number
  h: number
  color: string
  opacity: number
}

export interface InkAnnot extends AnnotBase {
  type: 'ink'
  points: { x: number; y: number }[]
  color: string
  width: number
}

export interface ImageAnnot extends AnnotBase {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  /** data: URL — kept as-is so the annotation stays self-contained. */
  dataUrl: string
  mime: 'image/png' | 'image/jpeg'
}

export type Annot = TextAnnot | BoxAnnot | InkAnnot | ImageAnnot

export interface Doc {
  pages: PageRef[]
  annots: Annot[]
}

export const EMPTY_DOC: Doc = { pages: [], annots: [] }

export function isBox(a: Annot): a is BoxAnnot {
  return a.type === 'rect' || a.type === 'highlight'
}

export function isPlaced(a: Annot): a is BoxAnnot | ImageAnnot {
  return a.type === 'rect' || a.type === 'highlight' || a.type === 'image'
}
