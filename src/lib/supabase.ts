import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Cliente general (usado en la mayoría de páginas)
export const supabase = createClient(url, key)

// Cliente para login/logout — guarda sesión en cookies (necesario para el middleware)
export function createSupabaseBrowser() {
  return createBrowserClient(url, key)
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export type Rol = 'estudiante' | 'docente'

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
}

export interface Acceso {
  id: string
  rut: string | null
  nombre: string | null
  curso: string | null
  notebook_id: string | null
  sala: string | null
  timestamp_inicio: string
  resultado: 'exitoso' | 'fallido' | 'override'
  tipo_evento: string
}

export interface SesionActiva {
  notebook_id: string
  rut: string
  inicio: string
  estudiantes?: { nombre: string; curso: string }
  docentes?: { nombre: string; especialidad: string }
  notebooks?: { nombre: string; sala: string }
}

export interface Alerta {
  id: string
  tipo: 'duplicado' | 'exceso_intentos' | 'rut_invalido' | 'sospechoso'
  notebook_id: string | null
  rut: string | null
  descripcion: string | null
  resuelta: boolean
  timestamp: string
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
}