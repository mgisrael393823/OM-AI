export function createTimeoutSignal(ms: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return { controller, signal: controller.signal, timeout }
}

export function mergeSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  signals.forEach(s => s.addEventListener('abort', () => controller.abort(), { once: true }))
  return controller.signal
}
// TODO[Claude]: integrate advanced timeout controllers and signal merging
