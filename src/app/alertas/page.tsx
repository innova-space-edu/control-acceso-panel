'use client'
import { useEffect, useState } from 'react'
import { supabase, type Alerta } from '@/lib/supabase'

const TIPO_LABEL: Record<string, string> = {
  duplicado:       '⚠ Duplicado',
  exceso_intentos: '🔒 Exceso intentos',
  rut_invalido:    '✗ RUT inválido',
  sospechoso:      '⚑ Sospechoso',
}
const TIPO_BADGE: Record<string, string> = {
  duplicado:       'badge-purple',
  exceso_intentos: 'badge-red',
  rut_invalido:    'badge-amber',
  sospechoso:      'badge-red',
}

interface ModalDuplicado {
  alerta: Alerta
  sesiones: { notebook_id: string; rut: string; inicio: string }[]
}

export default function AlertasPage() {
  const [alertas, setAlertas]       = useState<Alerta[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtro, setFiltro]         = useState<'pendientes' | 'todas'>('pendientes')
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [modal, setModal]           = useState<ModalDuplicado | null>(null)
  const [cerrandoSesion, setCerrandoSesion] = useState<string | null>(null)

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('alertas_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [filtro])

  async function cargar() {
    let q = supabase.from('alertas').select('*').order('timestamp', { ascending: false }).limit(100)
    if (filtro === 'pendientes') q = q.eq('resuelta', false)
    const { data } = await q
    setAlertas(data || [])
    setLoading(false)
  }

  async function resolver(id: string) {
    setResolviendo(id)
    await supabase.from('alertas').update({ resuelta: true }).eq('id', id)
    await cargar()
    setResolviendo(null)
  }

  async function resolverTodas() {
    await supabase.from('alertas').update({ resuelta: true }).eq('resuelta', false)
    await cargar()
  }

  // Abrir modal con opciones para alertas de duplicado
  async function abrirModalDuplicado(alerta: Alerta) {
    if (!alerta.rut) return
    const { data } = await supabase
      .from('sesiones_activas')
      .select('notebook_id, rut, inicio')
      .eq('rut', alerta.rut)
    setModal({ alerta, sesiones: data || [] })
  }

  // Cerrar sesión de un notebook específico
  async function cerrarSesionNotebook(notebook_id: string, alertaId: string) {
    setCerrandoSesion(notebook_id)
    await supabase.from('sesiones_activas').delete().eq('notebook_id', notebook_id)
    // Marcar acceso como cerrado
    const { data: accesos } = await supabase
      .from('accesos')
      .select('id')
      .eq('notebook_id', notebook_id)
      .is('timestamp_fin', null)
      .order('timestamp_inicio', { ascending: false })
      .limit(1)
    if (accesos && accesos.length > 0) {
      await supabase.from('accesos').update({
        timestamp_fin: new Date().toISOString()
      }).eq('id', accesos[0].id)
    }
    await resolver(alertaId)
    setModal(null)
    setCerrandoSesion(null)
  }

  // Cerrar todas las sesiones del RUT
  async function cerrarTodasSesiones(rut: string, alertaId: string) {
    setCerrandoSesion('todas')
    // Cerrar accesos abiertos
    const { data: accesos } = await supabase
      .from('accesos')
      .select('id')
      .eq('rut', rut)
      .is('timestamp_fin', null)
    if (accesos) {
      for (const a of accesos) {
        await supabase.from('accesos').update({
          timestamp_fin: new Date().toISOString()
        }).eq('id', a.id)
      }
    }
    // Eliminar todas las sesiones activas del RUT
    await supabase.from('sesiones_activas').delete().eq('rut', rut)
    await resolver(alertaId)
    setModal(null)
    setCerrandoSesion(null)
  }

  const pendientes = alertas.filter(a => !a.resuelta)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Alertas de seguridad</h1>
          <p className="text-slate-600 text-sm">Eventos detectados por los notebooks</p>
        </div>
        <div className="flex items-center gap-3">
          {pendientes.length > 1 && (
            <button onClick={resolverTodas}
              className="text-xs text-slate-500 hover:text-slate-300 border border-[#1a2a40] rounded-lg px-3 py-2 transition-colors">
              Resolver todas
            </button>
          )}
          <div className="flex rounded-lg overflow-hidden border border-[#1a2a40]">
            {(['pendientes', 'todas'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${filtro === f ? 'bg-blue-900/40 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {f === 'pendientes' ? `Pendientes (${pendientes.length})` : 'Todas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Notebook</th>
              <th>RUT</th>
              <th>Descripción</th>
              <th>Hora</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-slate-600 py-10">Cargando...</td></tr>
            ) : alertas.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <div className="text-3xl mb-3 opacity-20">✓</div>
                  <div className="text-slate-600 text-sm">Sin alertas pendientes</div>
                </td>
              </tr>
            ) : alertas.map(a => (
              <tr key={a.id} className={a.resuelta ? 'opacity-40' : ''}>
                <td>
                  <span className={`badge ${TIPO_BADGE[a.tipo] || 'badge-gray'}`}>
                    {TIPO_LABEL[a.tipo] || a.tipo}
                  </span>
                </td>
                <td className="font-mono text-xs">{a.notebook_id || '—'}</td>
                <td className="font-mono text-xs">{a.rut || '—'}</td>
                <td className="text-xs max-w-[220px] truncate">{a.descripcion || '—'}</td>
                <td className="font-mono text-xs">{new Date(a.timestamp).toLocaleString('es-CL')}</td>
                <td>
                  {a.resuelta ? (
                    <span className="badge badge-green text-[10px]">Resuelta</span>
                  ) : a.tipo === 'duplicado' ? (
                    <button
                      onClick={() => abrirModalDuplicado(a)}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium">
                      Gestionar →
                    </button>
                  ) : (
                    <button
                      onClick={() => resolver(a.id)}
                      disabled={resolviendo === a.id}
                      className="text-xs text-blue-500 hover:text-blue-300 disabled:text-slate-600 transition-colors">
                      {resolviendo === a.id ? 'Resolviendo...' : 'Resolver'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal para duplicados */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1520] border border-purple-900/50 rounded-2xl p-7 w-full max-w-md">
            <h2 className="text-slate-100 font-semibold text-lg mb-1">Acceso duplicado detectado</h2>
            <p className="text-slate-500 text-sm mb-5">
              RUT <span className="text-slate-300 font-mono">{modal.alerta.rut}</span> tiene sesiones activas en múltiples equipos.
            </p>

            {/* Sesiones activas del RUT */}
            {modal.sesiones.length > 0 && (
              <div className="mb-5 space-y-2">
                <p className="text-slate-500 text-xs uppercase tracking-widest mb-2">Sesiones activas</p>
                {modal.sesiones.map(s => (
                  <div key={s.notebook_id} className="flex items-center justify-between bg-[#111c2d] rounded-lg px-4 py-3">
                    <div>
                      <div className="text-slate-300 text-sm font-mono">{s.notebook_id}</div>
                      <div className="text-slate-600 text-xs">
                        Desde {new Date(s.inicio).toLocaleTimeString('es-CL')}
                      </div>
                    </div>
                    <button
                      onClick={() => cerrarSesionNotebook(s.notebook_id, modal.alerta.id)}
                      disabled={cerrandoSesion !== null}
                      className="text-xs text-red-500 hover:text-red-300 border border-red-900/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                      {cerrandoSesion === s.notebook_id ? 'Cerrando...' : 'Cerrar sesión'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Opciones */}
            <div className="space-y-2">
              <button
                onClick={() => cerrarTodasSesiones(modal.alerta.rut!, modal.alerta.id)}
                disabled={cerrandoSesion !== null}
                className="w-full bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50">
                {cerrandoSesion === 'todas' ? 'Cerrando todas...' : 'Cerrar todas las sesiones'}
              </button>
              <button
                onClick={() => { resolver(modal.alerta.id); setModal(null) }}
                className="w-full border border-[#1e3a5f] text-slate-400 hover:text-slate-200 text-sm py-2.5 rounded-lg transition-colors">
                Solo marcar como resuelta
              </button>
              <button
                onClick={() => setModal(null)}
                className="w-full text-slate-600 hover:text-slate-400 text-xs py-2 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
