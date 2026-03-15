'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ReportesPage() {
  const [generando, setGenerando] = useState<string | null>(null)

  const hoy = new Date().toISOString().split('T')[0]
  const [params, setParams] = useState({
    desde: hoy,
    hasta: hoy,
    curso: '',
    notebook: '',
    sala: '',
  })

  async function exportar(tipo: string) {
    setGenerando(tipo)
    try {
      const XLSX = await import('xlsx')

      let data: any[] = []

      if (tipo === 'accesos' || tipo === 'fallidos') {
        let q = supabase
          .from('accesos')
          .select('*')
          .gte('timestamp_inicio', params.desde + 'T00:00:00')
          .lte('timestamp_inicio', params.hasta + 'T23:59:59')
          .order('timestamp_inicio', { ascending: false })

        if (tipo === 'fallidos') q = q.eq('resultado', 'fallido')
        if (params.notebook) q = q.eq('notebook_id', params.notebook)
        if (params.sala) q = q.eq('sala', params.sala)
        if (params.curso) q = q.eq('curso', params.curso)

        const { data: rows } = await q
        data = (rows || []).map(r => ({
          'Fecha':       new Date(r.timestamp_inicio).toLocaleDateString('es-CL'),
          'Hora':        new Date(r.timestamp_inicio).toLocaleTimeString('es-CL'),
          'RUT':         r.rut || '',
          'Nombre':      r.nombre || '',
          'Curso':       r.curso || '',
          'Notebook':    r.notebook_id || '',
          'Sala':        r.sala || '',
          'Resultado':   r.resultado,
          'Tipo evento': r.tipo_evento,
        }))
      }

      if (tipo === 'alertas') {
        const { data: rows } = await supabase
          .from('alertas')
          .select('*')
          .gte('timestamp', params.desde + 'T00:00:00')
          .lte('timestamp', params.hasta + 'T23:59:59')
          .order('timestamp', { ascending: false })

        data = (rows || []).map(r => ({
          'Fecha':       new Date(r.timestamp).toLocaleDateString('es-CL'),
          'Hora':        new Date(r.timestamp).toLocaleTimeString('es-CL'),
          'Tipo':        r.tipo,
          'Notebook':    r.notebook_id || '',
          'RUT':         r.rut || '',
          'Descripción': r.descripcion || '',
          'Resuelta':    r.resuelta ? 'Sí' : 'No',
        }))
      }

      if (tipo === 'uso_por_curso') {
        const { data: rows } = await supabase
          .from('accesos')
          .select('curso, resultado')
          .gte('timestamp_inicio', params.desde + 'T00:00:00')
          .lte('timestamp_inicio', params.hasta + 'T23:59:59')
          .eq('resultado', 'exitoso')

        const conteo: Record<string, number> = {}
        for (const r of rows || []) {
          const c = r.curso || 'Sin curso'
          conteo[c] = (conteo[c] || 0) + 1
        }
        data = Object.entries(conteo)
          .sort((a, b) => b[1] - a[1])
          .map(([curso, total]) => ({ 'Curso': curso, 'Total accesos': total }))
      }

      if (data.length === 0) {
        alert('No hay datos para exportar con los filtros seleccionados.')
        setGenerando(null)
        return
      }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, tipo)

      const nombreArchivo = `control_acceso_${tipo}_${params.desde}_${params.hasta}.xlsx`
      XLSX.writeFile(wb, nombreArchivo)
    } catch (e) {
      console.error(e)
      alert('Error al generar el reporte')
    }
    setGenerando(null)
  }

  const reportes = [
    { id: 'accesos',      label: 'Todos los accesos',         desc: 'Historial completo con filtros de fecha, curso, sala y notebook', color: 'blue'   },
    { id: 'fallidos',     label: 'Accesos fallidos',          desc: 'Solo los intentos rechazados o con RUT inválido',                 color: 'red'    },
    { id: 'alertas',      label: 'Alertas de seguridad',      desc: 'Todos los eventos de alerta del período seleccionado',            color: 'amber'  },
    { id: 'uso_por_curso',label: 'Uso por curso',             desc: 'Resumen de cuántas veces usó equipos cada curso',                 color: 'green'  },
  ]

  const colorMap: Record<string, string> = {
    blue:  'border-blue-900/50 hover:border-blue-700',
    red:   'border-red-900/50 hover:border-red-700',
    amber: 'border-amber-900/50 hover:border-amber-700',
    green: 'border-emerald-900/50 hover:border-emerald-700',
  }
  const iconMap: Record<string, string> = { blue: '≡', red: '✗', amber: '⚠', green: '◑' }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Reportes Excel</h1>
        <p className="text-slate-600 text-sm">Exporta datos del sistema en formato .xlsx</p>
      </div>

      {/* Filtros globales */}
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-7">
        <h3 className="text-slate-500 text-xs uppercase tracking-widest mb-4">Parámetros del reporte</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">Desde</label>
            <input type="date" className="input-dark" value={params.desde}
              onChange={e => setParams(p => ({ ...p, desde: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Hasta</label>
            <input type="date" className="input-dark" value={params.hasta}
              onChange={e => setParams(p => ({ ...p, hasta: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">Curso (opcional)</label>
            <input className="input-dark" placeholder="3° A Medio" value={params.curso}
              onChange={e => setParams(p => ({ ...p, curso: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Notebook (opcional)</label>
            <input className="input-dark" placeholder="NB-LAB1-01" value={params.notebook}
              onChange={e => setParams(p => ({ ...p, notebook: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Sala (opcional)</label>
            <input className="input-dark" placeholder="Laboratorio 1" value={params.sala}
              onChange={e => setParams(p => ({ ...p, sala: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Cards de reportes */}
      <div className="grid grid-cols-2 gap-4">
        {reportes.map(r => (
          <button
            key={r.id}
            onClick={() => exportar(r.id)}
            disabled={generando === r.id}
            className={`text-left bg-[#0d1520] border rounded-xl p-5 transition-colors ${colorMap[r.color]} ${generando === r.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
          >
            <div className="text-2xl mb-3 opacity-40">{iconMap[r.color]}</div>
            <div className="text-slate-200 font-medium text-sm mb-1">{r.label}</div>
            <div className="text-slate-600 text-xs mb-4">{r.desc}</div>
            <div className={`text-xs font-semibold ${generando === r.id ? 'text-slate-500' : 'text-blue-500'}`}>
              {generando === r.id ? 'Generando...' : '↓ Exportar .xlsx'}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}