import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  if (configuredSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${configuredSecret}`) {
      return NextResponse.json({ ok: false, message: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createSupabaseAdmin()
  const now = new Date()
  const offlineThreshold = new Date(now.getTime() - 5 * 60_000).toISOString()
  const staleThreshold = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()

  const { data: goingOffline, error } = await admin
    .from('dispositivos_estado')
    .select('notebook_id,ultima_senal')
    .eq('online', true)
    .lt('ultima_senal', offlineThreshold)
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })

  if (goingOffline?.length) {
    await admin.from('dispositivos_estado').update({ online: false, actualizado_en: now.toISOString() })
      .in('notebook_id', goingOffline.map(d => d.notebook_id))
    await admin.from('eventos_sistema').insert(goingOffline.map(device => ({
      categoria: 'dispositivo', tipo_evento: 'dispositivo_sin_senal', severidad: 'media',
      resultado: 'offline', descripcion: `El dispositivo dejó de reportar por más de 5 minutos`,
      notebook_id: device.notebook_id, origen: 'cron', datos: { ultima_senal: device.ultima_senal },
    })))
  }

  await admin.from('comandos_remotos').update({ estado: 'expirado' })
    .in('estado', ['pendiente', 'enviado', 'recibido'])
    .lt('expira_en', now.toISOString())

  const { data: staleDevices } = await admin
    .from('dispositivos_estado')
    .select('notebook_id,ultima_senal')
    .lt('ultima_senal', staleThreshold)

  let incidentsCreated = 0
  for (const device of staleDevices || []) {
    const { data: existing } = await admin.from('incidencias').select('id')
      .eq('notebook_id', device.notebook_id)
      .eq('tipo', 'equipo_sin_senal_prolongada')
      .not('estado', 'in', '(resuelta,falsa_alarma)')
      .maybeSingle()
    if (!existing) {
      const { error: incidentError } = await admin.from('incidencias').insert({
        titulo: 'Equipo sin señal prolongada',
        descripcion: `${device.notebook_id} no ha reportado durante más de 24 horas.`,
        tipo: 'equipo_sin_senal_prolongada', severidad: 'alta', estado: 'nueva',
        notebook_id: device.notebook_id, datos: { ultima_senal: device.ultima_senal },
      })
      if (!incidentError) incidentsCreated++
    }
  }

  return NextResponse.json({ ok: true, marked_offline: goingOffline?.length || 0, incidents_created: incidentsCreated })
}
