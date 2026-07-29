export async function adminAction<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/actions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let data: Record<string, unknown> = {}
  try {
    data = raw ? JSON.parse(raw) as Record<string, unknown> : {}
  } catch {
    data = { message: raw || `Respuesta HTTP ${response.status}` }
  }

  if (!response.ok || !data.ok) {
    const message = String(data.message || 'No fue posible completar la acción')
    const details = data.details ? String(data.details) : ''
    throw new Error(details && details !== message ? `${message}: ${details}` : message)
  }

  return data as T
}
