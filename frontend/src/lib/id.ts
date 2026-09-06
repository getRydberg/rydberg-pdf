let counter = 0

/** Short, stable, session-local ids. Not persisted, so no need for uuids. */
export function uid(prefix: string): string {
  counter += 1
  return `${prefix}_${counter.toString(36)}`
}
