import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let browserClient: SupabaseClient | undefined

export function createSupabaseBrowser() {
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (typeof window === 'undefined') throw new Error('El cliente de Supabase del navegador no puede crearse en el servidor')
  if (!browserClient) browserClient = createBrowserClient(url, key)
  return browserClient
}

// Proxy diferido: evita inicializar createBrowserClient durante el render del servidor
// y mantiene un único cliente, una única sesión y una sola conexión Realtime en el navegador.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = createSupabaseBrowser()
    const value = (client as unknown as Record<PropertyKey, unknown>)[property]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export type Rol = 'estudiante' | 'docente'
export type Severidad = 'informativa' | 'baja' | 'media' | 'alta' | 'critica'
export type EstadoIncidencia = 'nueva' | 'en_revision' | 'asignada' | 'accion_ejecutada' | 'resuelta' | 'falsa_alarma'
export type EstadoComando = 'pendiente' | 'enviado' | 'recibido' | 'ejecutado' | 'fallido' | 'expirado' | 'cancelado'

export interface Estudiante {
  rut: string
  nombre: string
  curso: string
  activo: boolean
  observacion?: string
  creado_en?: string
}

export interface Docente {
  rut: string
  nombre: string
  especialidad?: string
  activo: boolean
}

export interface Notebook {
  id: string
  nombre: string
  sala: string
  estado: 'activo' | 'inactivo' | 'mantencion'
  registrado?: string
  codigo_inventario?: string | null
  numero_serie?: string | null
  marca?: string | null
  modelo?: string | null
  hostname?: string | null
  sistema_operativo?: string | null
  version_agente?: string | null
  mac_address?: string | null
  responsable?: string | null
  observacion?: string | null
  fecha_ultima_mantencion?: string | null
  estado_seguridad?: 'normal' | 'observacion' | 'perdido' | 'robado' | string | null
  fecha_modo_robado?: string | null
  agente_activo?: boolean | null
}

export interface DispositivoEstado {
  notebook_id: string
  online: boolean
  ultima_senal: string | null
  ip_local: string | null
  ip_public: string | null
  hostname: string | null
  red: string | null
  sistema_operativo: string | null
  version_agente: string | null
  usuario_sistema: string | null
  bateria: number | null
  conectado_corriente: boolean | null
  tiempo_encendido_segundos: number | null
  kiosk_activo: boolean | null
  examen_activo: boolean | null
  latencia_ms: number | null
  datos?: Record<string, unknown>
  actualizado_en: string
}

export interface Acceso {
  id: string
  rut: string | null
  nombre: string | null
  curso: string | null
  notebook_id: string | null
  sala: string | null
  timestamp_inicio: string
  timestamp_fin?: string | null
  duracion_minutos?: number | null
  resultado: 'exitoso' | 'fallido' | 'override'
  tipo_evento: string
}

export interface SesionActiva {
  notebook_id: string
  rut: string
  inicio: string
  forzar_cierre?: boolean
  estudiantes?: { nombre: string; curso: string }
  docentes?: { nombre: string; especialidad: string }
  notebooks?: { nombre: string; sala: string }
}

export interface Alerta {
  id: string
  tipo: 'duplicado' | 'exceso_intentos' | 'rut_invalido' | 'sospechoso' | string
  notebook_id: string | null
  rut: string | null
  descripcion: string | null
  resuelta: boolean
  timestamp: string
}

export interface Incidencia {
  id: string
  source_alert_id?: string | null
  titulo: string
  descripcion: string | null
  tipo: string
  severidad: Severidad
  estado: EstadoIncidencia
  notebook_id: string | null
  rut: string | null
  sala: string | null
  asignada_a?: string | null
  asignada_nombre?: string | null
  creada_en: string
  actualizada_en: string
  resuelta_en?: string | null
  resuelta_por?: string | null
  resuelta_por_nombre?: string | null
  resolucion?: string | null
  datos?: Record<string, unknown>
}

export interface EventoSistema {
  id: string
  fecha_hora: string
  fecha_hora_dispositivo?: string | null
  categoria: string
  tipo_evento: string
  severidad: Severidad
  resultado: string
  descripcion: string | null
  actor_user_id?: string | null
  actor_nombre?: string | null
  actor_rol?: string | null
  rut_usuario?: string | null
  nombre_usuario?: string | null
  notebook_id?: string | null
  sala?: string | null
  curso?: string | null
  sesion_id?: string | null
  incidencia_id?: string | null
  examen_id?: string | null
  comando_id?: string | null
  ip_local?: string | null
  ip_public?: string | null
  correlation_id?: string | null
  origen: string
  datos?: Record<string, unknown>
}

export interface ComandoRemoto {
  id: string
  lote_id?: string | null
  notebook_id: string
  tipo: string
  payload: Record<string, unknown>
  motivo?: string | null
  estado: EstadoComando
  prioridad: number
  solicitado_por?: string | null
  solicitado_por_nombre?: string | null
  creado_en: string
  expira_en: string
  enviado_en?: string | null
  recibido_en?: string | null
  ejecutado_en?: string | null
  resultado_detalle?: string | null
  intentos: number
}

export interface SolicitudOverride {
  id: string
  notebook_id: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  rut_override: string | null
  nombre_override: string | null
  curso_override: string | null
  resuelto_por: string | null
  creado_en: string
  resuelto_en: string | null
  motivo?: string | null
  duracion_minutos?: number | null
  lote_id?: string | null
  comando_id?: string | null
}
