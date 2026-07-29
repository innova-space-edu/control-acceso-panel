export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CL')
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CL')
}

export function formatTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('es-CL')
}

export function formatElapsed(value?: string | null, now = new Date()) {
  if (!value) return '—'
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function isOnline(lastSignal?: string | null, online?: boolean | null, maxMinutes = 5) {
  if (!online || !lastSignal) return false
  return Date.now() - new Date(lastSignal).getTime() <= maxMinutes * 60_000
}
