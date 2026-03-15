'use client'
import { useEffect, useState } from 'react'
import { supabase, type Alerta } from '@/lib/supabase'

const TIPO_LABEL: Record<string, string> = {
  duplicado:        '⚠ Duplicado',
  exceso_intentos:  '🔒 Exceso intentos',
  rut_invalido:     '✗ RUT inválido',
  sospechoso:       '⚑ Sospechoso',
}
const TIPO_BADGE: Record<string, string> = {
  duplicado:       'badge-purple',
  exceso_intentos: 'badge-red',
  rut_invalido:    'badge-amber',
  sospechoso:      'badge-red',
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'pendientes' | 'todas'>('pendientes')
  const [resolviendo, setResolviendo] = useState<string | null>(null)

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
            <button onClick={resolverTodas} className="text-xs text-slate-500 hover:text-slate-300 border border-[#1a2a40] rounded-lg px-3 py-2 transition-colors">
              Resolver todas
            </button>
          )}
          <div className="flex rounded-lg overflow-hidden border border-[#1a2a40]">
            {(['pendientes', 'todas'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${filtro === f ? 'bg-blue-900/40 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
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
                  ) : (
                    <button
                      onClick={() => resolver(a.id)}
                      disabled={resolviendo === a.id}
                      className="text-xs text-blue-500 hover:text-blue-300 disabled:text-slate-600 transition-colors"
                    >
                      {resolviendo === a.id ? 'Resolviendo...' : 'Resolver'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}