import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin, requireAdmin } from '@/lib/supabase-server'
import { createDeviceToken, hashDeviceToken } from '@/lib/security'

export const runtime = 'nodejs'

type Json = Record<string, unknown>

function errorResponse(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, message, details }, { status })
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    return [value.message, value.details, value.hint, value.code].filter(Boolean).map(String).join(' · ') || JSON.stringify(error)
  }
  return String(error || 'Error desconocido')
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return errorResponse(auth.message, auth.status)
  if (auth.profile.rol === 'solo_lectura') return errorResponse('El rol solo lectura no puede ejecutar acciones', 403)

  const body = await request.json().catch(() => ({})) as Json
  const action = String(body.action || '')
  const actorName = auth.profile.nombre || auth.user.email || 'Administrador'

  try {
    // En producción se usa SERVICE_ROLE. Si la variable aún no está configurada,
    // el cliente autenticado continúa funcionando bajo las políticas RLS de administrador.
    let admin: any = auth.supabase
    try {
      admin = createSupabaseAdmin()
    } catch (configurationError) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY no disponible; usando sesión administrativa con RLS.', configurationError)
    }

    if (action === 'command') {
      const requestedNotebookIds = Array.isArray(body.notebook_ids)
        ? [...new Set(body.notebook_ids.map(String).filter(Boolean))]
        : []
      const type = String(body.type || '')
      const reason = String(body.reason || '').trim()
      const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Json
      const expiryMinutes = Math.max(1, Math.min(1440, Number(body.expiry_minutes || 15)))

      if (!requestedNotebookIds.length || !type) return errorResponse('Selecciona al menos un notebook y un tipo de comando')
      if (!reason) return errorResponse('El motivo es obligatorio')

      const { data: existingNotebooks, error: notebookError } = await admin
        .from('notebooks')
        .select('id')
        .in('id', requestedNotebookIds)
      if (notebookError) throw notebookError

      const notebookIds = (existingNotebooks || []).map((item: { id: string }) => item.id)
      const missingNotebookIds = requestedNotebookIds.filter(id => !notebookIds.includes(id))
      if (!notebookIds.length) return errorResponse('Los notebooks seleccionados no existen en el inventario', 404, missingNotebookIds.join(', '))

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

      const { error: eventError } = await admin.from('eventos_sistema').insert(notebookIds.map(notebookId => ({
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
      if (eventError) console.warn('No fue posible registrar todos los eventos del comando', eventError)

      return NextResponse.json({
        ok: true,
        lote_id: lot.id,
        commands: data,
        warnings: missingNotebookIds.length ? [`No se enviaron comandos a: ${missingNotebookIds.join(', ')}`] : [],
      })
    }

    if (action === 'bulk_override') {
      const requestIds = Array.isArray(body.request_ids)
        ? [...new Set(body.request_ids.map(String).filter(Boolean))]
        : []
      const decision = String(body.decision || '')
      const reason = String(body.reason || '').trim()
      const duration = Math.max(1, Math.min(1440, Number(body.duration_minutes || 60)))
      if (!requestIds.length || !['aprobado', 'rechazado'].includes(decision)) return errorResponse('Solicitud o decisión inválida')
      if (!reason) return errorResponse('El motivo es obligatorio')

      const { data: requests, error: requestError } = await admin
        .from('solicitudes_override')
        .select('*')
        .in('id', requestIds)
        .eq('estado', 'pendiente')
      if (requestError) throw requestError
      if (!requests?.length) return errorResponse('No se encontraron solicitudes pendientes', 404)

      const warnings: string[] = []
      let lotId: string | null = null
      const commandByNotebook = new Map<string, string>()

      if (decision === 'aprobado') {
        const requestedNotebookIds = [...new Set(requests.map((item: any) => String(item.notebook_id || '')).filter(Boolean))]
        const { data: inventoryRows, error: inventoryError } = requestedNotebookIds.length
          ? await admin.from('notebooks').select('id').in('id', requestedNotebookIds)
          : { data: [], error: null }

        if (inventoryError) {
          warnings.push(`No fue posible validar el inventario: ${errorDetails(inventoryError)}`)
        } else {
          const notebookIds = (inventoryRows || []).map((item: { id: string }) => item.id)
          const missingNotebookIds = requestedNotebookIds.filter(id => !notebookIds.includes(id))
          if (missingNotebookIds.length) {
            warnings.push(`Solicitudes antiguas sin notebook registrado: ${missingNotebookIds.join(', ')}`)
          }

          if (notebookIds.length) {
            try {
              const { data: lot, error: lotError } = await admin.from('comandos_lotes').insert({
                tipo: 'desbloquear',
                motivo: reason,
                solicitado_por: auth.user.id,
                solicitado_por_nombre: actorName,
                total: notebookIds.length,
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
              commands?.forEach((command: { id: string; notebook_id: string }) => commandByNotebook.set(command.notebook_id, command.id))
            } catch (commandError) {
              // Mantiene compatibilidad con el desbloqueo antiguo basado en solicitudes_override.
              lotId = null
              warnings.push(`Las solicitudes se aprobaron, pero no se pudieron crear comandos del agente: ${errorDetails(commandError)}`)
            }
          } else {
            warnings.push('No se crearon comandos porque ninguna solicitud corresponde a un notebook registrado.')
          }
        }
      }

      const resolvedAt = new Date().toISOString()
      const commonUpdate: Json = {
        estado: decision,
        resuelto_por: actorName,
        resuelto_en: resolvedAt,
        motivo: reason,
        duracion_minutos: duration,
        lote_id: lotId,
      }

      let updateResult = await admin
        .from('solicitudes_override')
        .update(commonUpdate)
        .in('id', requests.map((item: any) => item.id))
        .eq('estado', 'pendiente')

      if (updateResult.error && /lote_id|duracion_minutos|motivo/i.test(errorDetails(updateResult.error))) {
        warnings.push('La tabla solicitudes_override aún no tiene todas las columnas V2; se aplicó el desbloqueo compatible.')
        updateResult = await admin
          .from('solicitudes_override')
          .update({ estado: decision, resuelto_por: actorName, resuelto_en: resolvedAt })
          .in('id', requests.map((item: any) => item.id))
          .eq('estado', 'pendiente')
      }
      if (updateResult.error) throw updateResult.error

      if (decision === 'aprobado' && requestIds.length === 1) {
        const requestedPerson = body.person && typeof body.person === 'object' ? body.person as Json : {}
        const requestRow = requests[0]
        const personUpdate: Json = {
          rut_override: String(requestedPerson.rut || requestRow.rut_override || '') || null,
          nombre_override: String(requestedPerson.nombre || requestRow.nombre_override || '') || null,
          curso_override: String(requestedPerson.detalle || requestRow.curso_override || '') || null,
        }
        const { error: personError } = await admin.from('solicitudes_override').update(personUpdate).eq('id', requestRow.id)
        if (personError) warnings.push(`No se actualizó la persona autorizada: ${errorDetails(personError)}`)
      }

      for (const [notebookId, commandId] of commandByNotebook.entries()) {
        const { error: commandLinkError } = await admin
          .from('solicitudes_override')
          .update({ comando_id: commandId })
          .in('id', requests.filter((item: any) => item.notebook_id === notebookId).map((item: any) => item.id))
        if (commandLinkError) warnings.push(`No se vinculó el comando de ${notebookId}: ${errorDetails(commandLinkError)}`)
      }

      const { error: eventError } = await admin.from('eventos_sistema').insert(requests.map((item: any) => ({
        categoria: 'desbloqueo',
        tipo_evento: decision === 'aprobado' ? 'desbloqueo_aprobado' : 'desbloqueo_rechazado',
        severidad: 'media',
        resultado: decision,
        descripcion: `${actorName}: ${reason}`,
        actor_user_id: auth.user.id,
        actor_nombre: actorName,
        notebook_id: item.notebook_id,
        origen: 'api_admin',
        datos: { solicitud_id: item.id, duracion_minutos: duration, lote_id: lotId },
      })))
      if (eventError) warnings.push(`No se registraron todos los eventos de auditoría: ${errorDetails(eventError)}`)

      return NextResponse.json({ ok: true, updated: requests.length, lote_id: lotId, warnings })
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
    const details = errorDetails(error)
    console.error('Admin action error', { action, details, error })
    return errorResponse('No fue posible completar la acción', 500, details)
  }
}
