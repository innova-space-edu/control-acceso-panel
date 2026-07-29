import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-server'
import { hashDeviceToken } from '@/lib/security'

export const runtime = 'nodejs'

function tokenFrom(request: NextRequest) {
  const authorization = request.headers.get('authorization') || ''
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim()
  return request.headers.get('x-device-token') || ''
}

async function identify(request: NextRequest) {
  const token = tokenFrom(request)
  if (!token) return null
  const admin = createSupabaseAdmin()
  const { data } = await admin.from('notebooks').select('id, sala').eq('agente_token_hash', hashDeviceToken(token)).eq('agente_activo', true).maybeSingle()
  return data ? { admin, notebook: data } : null
}

export async function GET(request: NextRequest) {
  const identity = await identify(request)
  if (!identity) return NextResponse.json({ ok: false, message: 'Dispositivo no autorizado' }, { status: 401 })
  const now = new Date().toISOString()
  const { admin, notebook } = identity

  await admin.from('comandos_remotos').update({ estado: 'expirado' })
    .eq('notebook_id', notebook.id).in('estado', ['pendiente', 'enviado', 'recibido']).lt('expira_en', now)

  const { data: commands, error } = await admin.from('comandos_remotos')
    .select('id, tipo, payload, motivo, prioridad, creado_en, expira_en, estado')
    .eq('notebook_id', notebook.id)
    .in('estado', ['pendiente', 'enviado', 'recibido'])
    .gt('expira_en', now)
    .order('prioridad', { ascending: true })
    .order('creado_en', { ascending: true })
    .limit(20)
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })

  if (commands?.length) {
    const newlyReceived = commands.filter(command => command.estado !== 'recibido')
    if (newlyReceived.length) {
      await admin.from('comandos_remotos').update({ estado: 'recibido', recibido_en: now })
        .in('id', newlyReceived.map(command => command.id))
      await admin.from('eventos_sistema').insert(newlyReceived.map(command => ({
        categoria: 'dispositivo', tipo_evento: `comando_${command.tipo}_recibido`, severidad: 'informativa',
        resultado: 'recibido', descripcion: `${notebook.id} recibió el comando ${command.tipo}`,
        notebook_id: notebook.id, comando_id: command.id, origen: 'agente',
      })))
    }
  }

  return NextResponse.json({ ok: true, commands: commands || [], server_time: now })
}

export async function POST(request: NextRequest) {
  const identity = await identify(request)
  if (!identity) return NextResponse.json({ ok: false, message: 'Dispositivo no autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const commandId = String(body.command_id || '')
  const status = String(body.status || '')
  const detail = String(body.detail || '')
  if (!commandId || !['ejecutado', 'fallido'].includes(status)) return NextResponse.json({ ok: false, message: 'Confirmación inválida' }, { status: 400 })

  const { admin, notebook } = identity
  const now = new Date().toISOString()
  const { data: command, error } = await admin.from('comandos_remotos').update({
    estado: status,
    ejecutado_en: now,
    resultado_detalle: detail || null,
  }).eq('id', commandId).eq('notebook_id', notebook.id).select('*').maybeSingle()
  if (error || !command) return NextResponse.json({ ok: false, message: 'Comando no encontrado' }, { status: 404 })

  await admin.from('eventos_sistema').insert({
    categoria: 'dispositivo', tipo_evento: `comando_${command.tipo}_${status}`,
    severidad: status === 'fallido' ? 'alta' : 'informativa', resultado: status,
    descripcion: detail || `${notebook.id}: ${status}`, notebook_id: notebook.id,
    comando_id: command.id, origen: 'agente', datos: { tipo: command.tipo },
  })

  return NextResponse.json({ ok: true })
}
