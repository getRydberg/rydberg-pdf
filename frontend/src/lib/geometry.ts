/**
 * Coordinate mapping between what you see and what gets written.
 *
 * On screen, a page is drawn *rotated*, with a top-left origin. In the file,
 * content is drawn into the page's unrotated user space with a bottom-left
 * origin. Every annotation is authored in the first frame and saved in the
 * second, so all of that conversion lives here rather than being smeared
 * through the drawing code.
 *
 * `W`/`H` below are always the page's UNROTATED width/height in points.
 */

export type Rotation = 0 | 90 | 180 | 270

export function normalizeRotation(deg: number): Rotation {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return r as Rotation
}

/** Size of the page as displayed, given its unrotated size and rotation. */
export function displaySize(w: number, h: number, rotation: number) {
  return normalizeRotation(rotation) % 180 === 90 ? { w: h, h: w } : { w, h }
}

/**
 * Display point (top-left origin, rotated frame) → PDF point (bottom-left
 * origin, unrotated user space).
 *
 * Derivation, for rotation r, treating display as the unrotated page turned
 * r° clockwise: the unrotated top-left-origin point (ux, uy) lands at
 *   r=90  → (H - uy, ux)      r=180 → (W - ux, H - uy)      r=270 → (uy, W - ux)
 * Inverting each and then flipping y (py = H - uy) gives the cases below.
 */
export function toPdfPoint(
  dx: number,
  dy: number,
  W: number,
  H: number,
  rotation: number,
): { x: number; y: number } {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: dy, y: dx }
    case 180:
      return { x: W - dx, y: dy }
    case 270:
      return { x: W - dy, y: H - dx }
    default:
      return { x: dx, y: H - dy }
  }
}

/**
 * pdf-lib rotates drawn content counter-clockwise about its anchor point.
 * To make content sit upright in a page displayed at r° clockwise, it must
 * be rotated r° counter-clockwise in user space — so the angle is just r.
 */
export function contentAngle(rotation: number): number {
  return normalizeRotation(rotation)
}

/**
 * Anchor for a display-space box (top-left x/y, width/height) as pdf-lib
 * wants it: the box's own bottom-left corner, which in display space is its
 * lower-left — (x, y + h).
 */
export function boxAnchor(
  x: number,
  y: number,
  h: number,
  W: number,
  H: number,
  rotation: number,
) {
  return toPdfPoint(x, y + h, W, H, rotation)
}

/** #rrggbb (or #rgb) → 0..1 components, for pdf-lib's rgb(). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n) || h.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  }
}

/** Normalize a drag (which can go right-to-left / bottom-to-top) to a box. */
export function rectFromDrag(
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}
