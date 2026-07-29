export async function adminAction<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible completar la acción')
  return data as T
}
