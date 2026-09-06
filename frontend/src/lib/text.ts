import { LINE_HEIGHT } from './save'

let ctx: CanvasRenderingContext2D | null = null

/**
 * Measure text the way the saved file will lay it out: Helvetica, no
 * wrapping, one line per newline. The browser's Helvetica/Arial metrics are
 * close enough to the standard font pdf-lib embeds that a text box on screen
 * matches the exported page.
 */
export function measureText(text: string, size: number) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  const lines = text.split('\n')
  let width = 0
  if (ctx) {
    ctx.font = `${size}px Helvetica, Arial, sans-serif`
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width)
  }
  return {
    lines: lines.length,
    // A little slack so the caret at the end of a line stays visible.
    width: Math.max(width + size * 0.4, size * 2),
    height: lines.length * size * LINE_HEIGHT,
  }
}
