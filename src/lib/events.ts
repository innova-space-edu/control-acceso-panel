import { supabase } from '@/lib/supabase'

export type EventSeverity = 'informativa' | 'baja' | 'media' | 'alta' | 'critica'

export async function registrarEvento(input: {
  categoria: string
  tipo_evento: string
  descripcion?: string
  severidad?: EventSeverity
  resultado?: string
  notebook_id?: string | null
  rut_usuario?: string | null
  nombre_usuario?: string | null
  sala?: string | null
  curso?: string | null
  origen?: string
  datos?: Record<string, unknown>
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const actorNombre = user?.user_metadata?.full_name || user?.email || 'Administrador'
  const { error } = await supabase.from('eventos_sistema').insert({
    ...input,
    severidad: input.severidad || 'informativa',
    resultado: input.resultado || 'registrado',
    origen: input.origen || 'panel',
    actor_user_id: user?.id || null,
    actor_nombre: actorNombre,
  })
  return { error }
}
