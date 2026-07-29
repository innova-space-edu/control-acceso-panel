import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-server'
import { getRequestIp, hashDeviceToken } from '@/lib/security'

export const runtime = 'nodejs'

function tokenFrom(request: NextRequest) {
  const authorization = request.headers.get('authorization') || ''
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim()
  return request.headers.get('x-device-token') || ''
}

export async function POST(request: NextRequest) {
  const token = tokenFrom(request)
  if (!token) return NextResponse.json({ ok: false, message: 'Token requerido' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const admin = createSupabaseAdmin()
  const { data: notebook, error: notebookError } = await admin
    .from('notebooks')
    .select('*')
    .eq('agente_token_hash', hashDeviceToken(token))
    .eq('agente_activo', true)
    .maybeSingle()

  if (notebookError || !notebook) return NextResponse.json({ ok: false, message: 'Dispositivo no autorizado' }, { status: 401 })

  const now = new Date().toISOString()
  const publicIp = String(body.ip_public || getRequestIp(request.headers) || '') || null
  const state = {
    notebook_id: notebook.id,
    online: true,
    ultima_senal: now,
    ip_local: body.ip_local || null,
    ip_public: publicIp,
    hostname: body.hostname || notebook.hostname || null,
    red: body.red || null,
    sistema_operativo: body.sistema_operativo || notebook.sistema_operativo || null,
    version_agente: body.version_agente || notebook.version_agente || null,
    usuario_sistema: body.usuario_sistema || null,
    bateria: typeof body.bateria === 'number' ? body.bateria : null,
    conectado_corriente: typeof body.conectado_corriente === 'boolean' ? body.conectado_corriente : null,
    tiempo_encendido_segundos: typeof body.tiempo_encendido_segundos === 'number' ? body.tiempo_encendido_segundos : null,
    kiosk_activo: typeof body.kiosk_activo === 'boolean' ? body.kiosk_activo : null,
    examen_activo: typeof body.examen_activo === 'boolean' ? body.examen_activo : null,
    latencia_ms: typeof body.latencia_ms === 'number' ? body.latencia_ms : null,
    datos: typeof body.datos === 'object' && body.datos ? body.datos : {},
    actualizado_en: now,
  }

  const { data: previous } = await admin.from('dispositivos_estado').select('*').eq('notebook_id', notebook.id).maybeSingle()
  const { error: stateError } = await admin.from('dispositivos_estado').upsert(state)
  if (stateError) return NextResponse.json({ ok: false, message: stateError.message }, { status: 500 })

  const notebookPatch: Record<string, unknown> = {}
  if (state.hostname && state.hostname !== notebook.hostname) notebookPatch.hostname = state.hostname
  if (state.sistema_operativo && state.sistema_operativo !== notebook.sistema_operativo) notebookPatch.sistema_operativo = state.sistema_operativo
  if (state.version_agente && state.version_agente !== notebook.version_agente) notebookPatch.version_agente = state.version_agente
  if (Object.keys(notebookPatch).length) {
    await admin.from('notebooks').update(notebookPatch).eq('id', notebook.id)
  }

  const importantChange = !previous || previous.online === false || previous.ip_public !== publicIp || previous.usuario_sistema !== state.usuario_sistema || previous.examen_activo !== state.examen_activo
  const lastStoredAt = previous?.datos && typeof previous.datos === 'object' ? (previous.datos as Record<string, unknown>).last_stored_heartbeat : null
  const storeByTime = !lastStoredAt || Date.now() - new Date(String(lastStoredAt)).getTime() > 15 * 60_000

  if (importantChange || storeByTime) {
    await admin.from('dispositivos_heartbeats').insert({
      notebook_id: notebook.id,
      fecha_hora_dispositivo: body.fecha_hora_dispositivo || null,
      ip_local: state.ip_local,
      ip_public: state.ip_public,
      hostname: state.hostname,
      red: state.red,
      usuario_sistema: state.usuario_sistema,
      bateria: state.bateria,
      kiosk_activo: state.kiosk_activo,
      examen_activo: state.examen_activo,
      cambios: { previous_online: previous?.online ?? null, important_change: importantChange },
    })
    await admin.from('dispositivos_estado').update({
      datos: { ...(state.datos as Record<string, unknown>), last_stored_heartbeat: now },
    }).eq('notebook_id', notebook.id)
  }

  const wasOffline = previous && previous.online === false
  if (!previous || wasOffline || importantChange) {
    await admin.from('eventos_sistema').insert({
      fecha_hora_dispositivo: body.fecha_hora_dispositivo || null,
      categoria: 'dispositivo',
      tipo_evento: !previous || wasOffline ? 'dispositivo_en_linea' : 'heartbeat_cambio',
      severidad: notebook.estado_seguridad === 'robado' ? 'critica' : 'informativa',
      resultado: 'online',
      descripcion: `${notebook.id} reportó conexión`,
      notebook_id: notebook.id,
      sala: notebook.sala,
      ip_local: state.ip_local,
      ip_public: state.ip_public,
      origen: 'agente',
      datos: { hostname: state.hostname, red: state.red, usuario_sistema: state.usuario_sistema },
    })
  }

  let theftIncident = null
  if (['perdido', 'robado'].includes(notebook.estado_seguridad)) {
    const { data: existing } = await admin.from('incidencias')
      .select('id')
      .eq('notebook_id', notebook.id)
      .eq('tipo', 'equipo_robado_online')
      .not('estado', 'in', '(resuelta,falsa_alarma)')
      .maybeSingle()

    if (!existing) {
      const { data: incident } = await admin.from('incidencias').insert({
        titulo: `Equipo ${notebook.estado_seguridad} volvió a conectarse`,
        descripcion: `Se recibió una señal por internet desde ${notebook.id}. IP pública: ${publicIp || 'no disponible'}.`,
        tipo: 'equipo_robado_online',
        severidad: 'critica',
        estado: 'nueva',
        notebook_id: notebook.id,
        sala: notebook.sala,
        datos: { ip_public: publicIp, ip_local: state.ip_local, red: state.red, hostname: state.hostname },
      }).select('id').single()
      theftIncident = incident?.id || null
      if (theftIncident) {
        await admin.from('notificaciones').insert({
          tipo: 'seguridad', titulo: `SEÑAL RECIBIDA: ${notebook.id}`,
          mensaje: `El equipo marcado como ${notebook.estado_seguridad} se conectó a internet.`,
          severidad: 'critica', incidencia_id: theftIncident, notebook_id: notebook.id,
        })
      }
    } else {
      theftIncident = existing.id
    }
  }

  await admin.from('comandos_remotos').update({ estado: 'expirado' })
    .eq('notebook_id', notebook.id)
    .in('estado', ['pendiente', 'enviado'])
    .lt('expira_en', now)

  const heartbeatSeconds = notebook.estado_seguridad === 'robado' || state.examen_activo ? 30 : 120
  return NextResponse.json({ ok: true, notebook_id: notebook.id, server_time: now, heartbeat_seconds: heartbeatSeconds, theft_incident_id: theftIncident })
}
