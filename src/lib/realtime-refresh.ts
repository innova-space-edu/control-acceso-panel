export function createRealtimeRefresh(refresh: () => void | Promise<void>, delay = 350) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued = false
  let cancelled = false

  async function execute() {
    if (cancelled) return
    if (running) {
      queued = true
      return
    }

    running = true
    try {
      await refresh()
    } finally {
      running = false
      if (queued && !cancelled) {
        queued = false
        schedule()
      }
    }
  }

  function schedule() {
    if (cancelled) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void execute()
    }, delay)
  }

  function cancel() {
    cancelled = true
    queued = false
    if (timer) clearTimeout(timer)
    timer = null
  }

  return { execute, schedule, cancel }
}
