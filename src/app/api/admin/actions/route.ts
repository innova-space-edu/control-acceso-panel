import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin, requireAdmin } from '@/lib/supabase-server'
import { createDeviceToken, hashDeviceToken } from '@/lib/security'

export const runtime = 'nodejs'

type Json = Record<string, unknown>

function errorResponse(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, message, details }, { status })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return errorResponse(auth.message, auth.status)
  if (auth.profile.rol === 'solo_lectura') return errorResponse('El rol solo lectura no puede ejecutar acciones', 403)

  const body = await request.json().catch(() => ({})) as Json
  const action = String(body.action || '')
  const admin = createSupabaseAdmin()
  const actorName = auth.profile.nombre || auth.user.email || 'Administrador'

  try {
    if (action === 'command') {
      const notebookIds = Array.isArray(body.notebook_ids)
        ? [...new Set(body.notebook_ids.map(String).filter(Boolean))]
        : []
      const type = String(body.type || '')
      const reason = String(body.reason || '').trim()
      const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Json
      const expiryMinutes = Math.max(1, Math.min(1440, Number(body.expiry_minutes || 15)))

      if (!notebookIds.length || !type) return errorResponse('Selecciona al menos un notebook y un tipo de comando')
      if (!reason) return errorResponse('El motivo es obligatorio')

      const { data: lot, error: lotError } = await admin.from('comandos_lotes').insert({
        tipo: type,
        motivo: reason,
        solicitado_por: auth.user.id,
        solicitado_por_nombre: actorName,
        total: notebookIds.length,
      }).select('id').single()
      if (lotError) throw lotError

      const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString()
      const commands = notebookIds.map(notebookId => ({
        lote_id: lot.id,
        notebook_id: notebookId,
        tipo: type,
        payload,
        motivo: reason,
        solicitado_por: auth.user.id,
        solicitado_por_nombre: actorName,
        expira_en: expiresAt,
      }))

      const { data, error } = await admin.from('comandos_remotos').insert(commands).select('*')
      if (error) throw error

      await admin.from('eventos_sistema').insert(notebookIds.map(notebookId => ({
        categoria: 'dispositivo',
        tipo_evento: `comando_${type}`,
        severidad: ['bloquear', 'modo_robado'].includes(type) ? 'alta' : 'informativa',
        resultado: 'pendiente',
        descripcion: `${actorName} envió el comando ${type}: ${reason}`,
        actor_user_id: auth.user.id,
        actor_nombre: actorName,
        notebook_id: notebookId,
        origen: 'api_admin',
        datos: { lote_id: lot.id, payload },
      })))

      return NextResponse.json({ ok: true, lote_id: lot.id, commands: data })
    }

    if (action === 'bulk_override') {
      const requestIds = Array.isArray(body.request_ids) ? body.request_ids.map(String).filter(Boolean) : []
      const decision = String(body.decision || '')
      const reason = String(body.reason || '').trim()
      const duration = Math.max(1, Math.min(1440, Number(body.duration_minutes || 60)))
      if (!requestIds.length || !['aprobado', 'rechazado'].includes(decision)) return errorResponse('Solicitud o decisión inválida')
      if (!reason) return errorResponse('El motivo es obligatorio')

      const { data: requests, error: requestError } = await admin
        .from('solicitudes_override')
        .select('*')
        .in('id', requestIds)
      if (requestError) throw requestError
      if (!requests?.length) return errorResponse('No se encontraron solicitudes pendientes', 404)

      let lotId: string | null = null
      const commandByNotebook = new Map<string, string>()
      if (decision === 'aprobado') {
        const notebookIds = [...new Set(requests.map(r => r.notebook_id).filter(Boolean))]
        const { data: lot, error: lotError } = await admin.from('comandos_lotes').insert({
          tipo: 'desbloquear', motivo: reason, solicitado_por: auth.user.id,
          solicitado_por_nombre: actorName, total: notebookIds.length,
        }).select('id').single()
        if (lotError) throw lotError
        lotId = lot.id
        const { data: commands, error: commandError } = await admin.from('comandos_remotos').insert(
          notebookIds.map(notebookId => ({
            lote_id: lot.id,
            notebook_id: notebookId,
            tipo: 'desbloquear',
            motivo: reason,
            payload: { duration_minutes: duration },
            solicitado_por: auth.user.id,
            solicitado_por_nombre: actorName,
            expira_en: new Date(Date.now() + 15 * 60_000).toISOString(),
          }))
        ).select('id, notebook_id')
        if (commandError) throw commandError
        commands?.forEach(c => commandByNotebook.set(c.notebook_id, c.id))
      }

      for (const req of requests) {
        const requestedPerson = body.person && typeof body.person === 'object' ? body.person as Json : {}
        const update: Json = {
          estado: decision,
          resuelto_por: actorName,
          resuelto_en: new Date().toISOString(),
          motivo: reason,
          duracion_minutos: duration,
          lote_id: lotId,
          comando_id: commandByNotebook.get(req.notebook_id) || null,
        }
        if (decision === 'aprobado' && requestIds.length === 1) {
          update.rut_override = String(requestedPerson.rut || req.rut_override || '') || null
          update.nombre_override = String(requestedPerson.nombre || req.nombre_override || '') || null
          update.curso_override = String(requestedPerson.detalle || req.curso_override || '') || null
        }
        const { error } = await admin.from('solicitudes_override').update(update).eq('id', req.id)
        if (error) throw error
      }

      await admin.from('eventos_sistema').insert(requests.map(req => ({
        categoria: 'desbloqueo',
        tipo_evento: decision === 'aprobado' ? 'desbloqueo_aprobado' : 'desbloqueo_rechazado',
        severidad: 'media',
        resultado: decision,
        descripcion: `${actorName}: ${reason}`,
        actor_user_id: auth.user.id,
        actor_nombre: actorName,
        notebook_id: req.notebook_id,
        origen: 'api_admin',
        datos: { solicitud_id: req.id, duracion_minutos: duration, lote_id: lotId },
      })))

      return NextResponse.json({ ok: true, updated: requests.length, lote_id: lotId })
    }

    if (action === 'incident') {
      const incidentId = String(body.incident_id || '')
      const state = String(body.state || '')
      const resolution = String(body.resolution || '').trim()
      if (!incidentId || !state) return errorResponse('Incidencia o estado inválido')
      if (['resuelta', 'falsa_alarma'].includes(state) && !resolution) return errorResponse('La resolución es obligatoria')

      const update: Json = {
        estado: state,
        actualizada_en: new Date().toISOString(),
      }
      if (['resuelta', 'falsa_alarma'].includes(state)) {
        update.resuelta_en = new Date().toISOString()
        update.resuelta_por = auth.user.id
        update.resuelta_por_nombre = actorName
        update.resolucion = resolution
      }
      if (body.assigned_name) update.asignada_nombre = String(body.assigned_name)

      const { data: incident, error } = await admin.from('incidencias').update(update).eq('id', incidentId).select('*').single()
      if (error) throw error

      await admin.from('incidencia_eventos').insert({
        incidencia_id: incidentId,
        comentario: resolution || `Estado cambiado a ${state}`,
        creado_por: auth.user.id,
        creado_por_nombre: actorName,
      })
      await admin.from('eventos_sistema').insert({
        categoria: 'incidencia', tipo_evento: 'incidencia_actualizada', severidad: incident.severidad,
        resultado: state, descripcion: resolution || `Estado cambiado a ${state}`,
        actor_user_id: auth.user.id, actor_nombre: actorName, notebook_id: incident.notebook_id,
        rut_usuario: incident.rut, incidencia_id: incidentId, origen: 'api_admin',
      })
      return NextResponse.json({ ok: true, incident })
    }

    if (action === 'mark_security') {
      const notebookId = String(body.notebook_id || '')
      const state = String(body.state || '')
      const reason = String(body.reason || '').trim()
      if (!notebookId || !['normal', 'observacion', 'perdido', 'robado'].includes(state)) return errorResponse('Estado de seguridad inválido')
      if (state !== 'normal' && !reason) return errorResponse('El motivo es obligatorio')

      const { error: notebookError } = await admin.from('notebooks').update({
        estado_seguridad: state,
        fecha_modo_robado: state === 'robado' ? new Date().toISOString() : null,
      }).eq('id', notebookId)
      if (notebookError) throw notebookError

      let incidentId: string | null = null
      if (['perdido', 'robado'].includes(state)) {
        const { data: incident, error: incidentError } = await admin.from('incidencias').insert({
          titulo: state === 'robado' ? 'Equipo marcado como robado' : 'Equipo marcado como perdido',
          descripcion: reason,
          tipo: `equipo_${state}`,
          severidad: state === 'robado' ? 'critica' : 'alta',
          estado: 'nueva',
          notebook_id: notebookId,
          datos: { marcado_por: actorName },
        }).select('id').single()
        if (incidentError) throw incidentError
        incidentId = incident.id

        await admin.from('notificaciones').insert({
          tipo: 'seguridad', titulo: `Alerta: ${notebookId} ${state}`,
          mensaje: reason, severidad: state === 'robado' ? 'critica' : 'alta',
          incidencia_id: incidentId, notebook_id: notebookId,
        })
      }

      await admin.from('eventos_sistema').insert({
        categoria: 'seguridad', tipo_evento: `estado_${state}`,
        severidad: state === 'robado' ? 'critica' : state === 'perdido' ? 'alta' : 'informativa',
        resultado: state, descripcion: reason || 'Estado normalizado',
        actor_user_id: auth.user.id, actor_nombre: actorName, notebook_id: notebookId,
        incidencia_id: incidentId, origen: 'api_admin',
      })

      return NextResponse.json({ ok: true, incident_id: incidentId })
    }

    if (action === 'rotate_device_token') {
      const notebookId = String(body.notebook_id || '')
      if (!notebookId) return errorResponse('Notebook inválido')
      const token = createDeviceToken()
      const { error } = await admin.from('notebooks').update({
        agente_token_hash: hashDeviceToken(token),
        agente_activo: true,
      }).eq('id', notebookId)
      if (error) throw error
      await admin.from('eventos_sistema').insert({
        categoria: 'dispositivo', tipo_evento: 'token_agente_rotado', severidad: 'alta',
        resultado: 'exitoso', descripcion: `Credencial del agente rotada por ${actorName}`,
        actor_user_id: auth.user.id, actor_nombre: actorName, notebook_id: notebookId, origen: 'api_admin',
      })
      return NextResponse.json({ ok: true, notebook_id: notebookId, token })
    }

    return errorResponse('Acción no reconocida', 404)
  } catch (error) {
    console.error('Admin action error', error)
    return errorResponse('No fue posible completar la acción', 500, error instanceof Error ? error.message : error)
  }
}
