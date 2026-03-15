'use client'
import { useEffect, useState } from 'react'
import { supabase, type Acceso } from '@/lib/supabase'

export default function HistorialPage() {
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const POR_PAG = 50

  const [filtros, setFiltros] = useState({
    desde: new Date().toISOString().split('T')[0],
    hasta: new Date().toISOString().split('T')[0],
    resultado: '',
    notebook: '',
    texto: '',
  })

  useEffect(() => { cargar() }, [pagina])

  async function cargar() {
    setLoading(true)
    let q = supabase
      .from('accesos')
      .select('*', { count: 'exact' })
      .order('timestamp_inicio', { ascending: false })
      .range(pagina * POR_PAG, (pagina + 1) * POR_PAG - 1)

    if (filtros.desde) q = q.gte('timestamp_inicio', filtros.desde + 'T00:00:00')
    if (filtros.hasta) q = q.lte('timestamp_inicio', filtros.hasta + 'T23:59:59')
    if (filtros.resultado) q = q.eq('resultado', filtros.resultado)
    if (filtros.notebook) q = q.eq('notebook_id', filtros.notebook)
    if (filtros.texto) q = q.or(`nombre.ilike.%${filtros.texto}%,rut.ilike.%${filtros.texto}%`)

    const { data, count } = await q
    setAccesos(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function buscar() { setPagina(0); cargar() }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Historial de accesos</h1>
        <p className="text-slate-600 text-sm">Todos los eventos registrados por los notebooks</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">Desde</label>
            <input type="date" className="input-dark" value={filtros.desde}
              onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Hasta</label>
            <input type="date" className="input-dark" value={filtros.hasta}
              onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">Resultado</label>
            <select className="input-dark" value={filtros.resultado}
              onChange={e => setFiltros(f => ({ ...f, resultado: e.target.value }))}>
              <option value="">Todos</option>
              <option value="exitoso">Exitoso</option>
              <option value="fallido">Fallido</option>
              <option value="override">Override</option>
            </select>
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Notebook</label>
            <input className="input-dark" placeholder="NB-LAB1-01" value={filtros.notebook}
              onChange={e => setFiltros(f => ({ ...f, notebook: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Nombre o RUT</label>
            <input className="input-dark" placeholder="Buscar..." value={filtros.texto}
              onChange={e => setFiltros(f => ({ ...f, texto: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && buscar()} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-slate-600 text-xs">{total.toLocaleString()} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</span>
          <button onClick={buscar} className="btn-primary text-xs py-2 px-5">Aplicar filtros</button>
        </div>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Curso</th>
              <th>Notebook</th>
              <th>Sala</th>
              <th>Fecha y hora</th>
              <th>Resultado</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-600 py-10">Cargando...</td></tr>
            ) : accesos.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-slate-600 py-10">Sin registros con los filtros aplicados</td></tr>
            ) : accesos.map(a => (
              <tr key={a.id}>
                <td className="text-slate-300">{a.nombre || <span className="text-slate-600">—</span>}</td>
                <td className="font-mono text-xs">{a.rut || '—'}</td>
                <td className="text-xs">{a.curso || '—'}</td>
                <td className="font-mono text-xs">{a.notebook_id || '—'}</td>
                <td className="text-xs">{a.sala || '—'}</td>
                <td className="font-mono text-xs">{new Date(a.timestamp_inicio).toLocaleString('es-CL')}</td>
                <td>
                  {a.resultado === 'exitoso'  && <span className="badge badge-green">✓ Exitoso</span>}
                  {a.resultado === 'fallido'  && <span className="badge badge-red">✗ Fallido</span>}
                  {a.resultado === 'override' && <span className="badge badge-purple">⊕ Override</span>}
                </td>
                <td className="text-xs text-slate-500">{a.tipo_evento}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {total > POR_PAG && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPagina(p => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="text-sm text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-slate-600 text-xs">
            Página {pagina + 1} de {Math.ceil(total / POR_PAG)}
          </span>
          <button
            onClick={() => setPagina(p => p + 1)}
            disabled={(pagina + 1) * POR_PAG >= total}
            className="text-sm text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}