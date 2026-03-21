'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ── TIPOS ──────────────────────────────────────────────────────────────────────
interface DonutData {
  label: string
  value: number
  color: string
}

interface EstadisticasData {
  resultados: DonutData[]
  cursos: DonutData[]
  notebooks: DonutData[]
  porHora: DonutData[]
}

// ── PALETAS DE COLORES ─────────────────────────────────────────────────────────
const COLORES_RESULTADO = ['#22d3ee', '#f43f5e', '#a855f7']
const COLORES_CURSOS    = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#84cc16']
const COLORES_NOTEBOOKS = ['#38bdf8','#fb7185','#a78bfa','#34d399','#fbbf24','#60a5fa','#f472b6','#4ade80','#fb923c','#c084fc']
const COLORES_HORA      = ['#0ea5e9','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#fb923c','#f59e0b','#84cc16','#22c55e','#10b981']

// ── COMPONENTE DONUT ───────────────────────────────────────────────────────────
function DonutChart({ data, titulo, total }: {
  data: DonutData[]
  titulo: string
  total: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const r  = Math.min(cx, cy) - 10
    const ri = r * 0.58  // radio interior

    ctx.clearRect(0, 0, w, h)

    let startAngle = -Math.PI / 2
    const totalVal = data.reduce((s, d) => s + d.value, 0)
    if (totalVal === 0) return

    data.forEach((seg, i) => {
      const slice = (seg.value / totalVal) * 2 * Math.PI
      const endAngle = startAngle + slice
      const isHov = hovered === i
      const offset = isHov ? 6 : 0

      const midAngle = startAngle + slice / 2
      const ox = Math.cos(midAngle) * offset
      const oy = Math.sin(midAngle) * offset

      // Sombra
      ctx.shadowColor = seg.color + '66'
      ctx.shadowBlur  = isHov ? 18 : 8

      ctx.beginPath()
      ctx.moveTo(cx + ox, cy + oy)
      ctx.arc(cx + ox, cy + oy, r, startAngle, endAngle)
      ctx.arc(cx + ox, cy + oy, ri, endAngle, startAngle, true)
      ctx.closePath()

      // Gradiente radial
      const grad = ctx.createRadialGradient(cx + ox, cy + oy, ri, cx + ox, cy + oy, r)
      grad.addColorStop(0, seg.color + 'cc')
      grad.addColorStop(1, seg.color)
      ctx.fillStyle = grad
      ctx.fill()

      // Borde
      ctx.strokeStyle = '#060a10'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.shadowBlur = 0
      startAngle = endAngle
    })

    // Texto central
    ctx.fillStyle = '#f1f5f9'
    ctx.font = `bold ${Math.floor(r * 0.28)}px Segoe UI`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(total.toString(), cx, cy - 8)
    ctx.fillStyle = '#475569'
    ctx.font = `${Math.floor(r * 0.14)}px Segoe UI`
    ctx.fillText('total', cx, cy + 14)

  }, [data, hovered, total])

  // Detectar hover
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left - canvas.width / 2
    const my = e.clientY - rect.top  - canvas.height / 2
    const dist = Math.sqrt(mx * mx + my * my)
    const r  = Math.min(canvas.width, canvas.height) / 2 - 10
    const ri = r * 0.58

    if (dist < ri || dist > r) { setHovered(null); return }

    let angle = Math.atan2(my, mx) + Math.PI / 2
    if (angle < 0) angle += 2 * Math.PI
    const totalVal = data.reduce((s, d) => s + d.value, 0)
    let start = 0
    for (let i = 0; i < data.length; i++) {
      const slice = (data[i].value / totalVal) * 2 * Math.PI
      if (angle >= start && angle < start + slice) { setHovered(i); return }
      start += slice
    }
    setHovered(null)
  }

  const totalVal = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-[#0d1520] border border-[#1a2a40] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <h3 className="text-slate-300 text-sm font-semibold">{titulo}</h3>
      </div>

      {data.length === 0 ? (
        <div className="text-center text-slate-600 text-xs py-8">Sin datos</div>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Canvas donut */}
          <div className="flex-shrink-0">
            <canvas
              ref={canvasRef}
              width={160} height={160}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            />
          </div>

          {/* Leyenda */}
          <div className="flex-1 space-y-1.5 min-w-0">
            {data.map((d, i) => {
              const pct = totalVal > 0 ? ((d.value / totalVal) * 100).toFixed(1) : '0'
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 cursor-pointer transition-all ${
                    hovered === i ? 'bg-white/5' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.color, boxShadow: `0 0 6px ${d.color}88` }}
                  />
                  <span className="text-slate-400 text-xs truncate flex-1" title={d.label}>
                    {d.label}
                  </span>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: d.color }}>
                    {pct}%
                  </span>
                  <span className="text-slate-600 text-xs flex-shrink-0">
                    ({d.value})
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PÁGINA PRINCIPAL ───────────────────────────────────────────────────────────
export default function ReportesPage() {
  const [generando, setGenerando] = useState<string | null>(null)
  const [stats, setStats]         = useState<EstadisticasData | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  const hoy = new Date().toISOString().split('T')[0]
  const [params, setParams] = useState({
    desde: hoy, hasta: hoy,
    curso: '', notebook: '', sala: '',
  })

  // Cargar estadísticas al iniciar y en tiempo real
  useEffect(() => {
    cargarEstadisticas()

    const canal = supabase
      .channel('reportes_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'accesos' }, cargarEstadisticas)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'accesos' }, cargarEstadisticas)
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [params.desde, params.hasta])

  async function cargarEstadisticas() {
    setLoadingStats(true)
    const desde = params.desde + 'T00:00:00'
    const hasta = params.hasta + 'T23:59:59'

    const { data: rows } = await supabase
      .from('accesos')
      .select('resultado, curso, notebook_id, timestamp_inicio')
      .gte('timestamp_inicio', desde)
      .lte('timestamp_inicio', hasta)

    if (!rows) { setLoadingStats(false); return }

    // Por resultado
    const porResultado: Record<string, number> = {}
    rows.forEach(r => { porResultado[r.resultado] = (porResultado[r.resultado] || 0) + 1 })
    const resultadoLabels: Record<string, string> = {
      exitoso: '✓ Exitoso', fallido: '✗ Fallido', override: '⊕ Override'
    }
    const resultados: DonutData[] = Object.entries(porResultado).map(([k, v], i) => ({
      label: resultadoLabels[k] || k, value: v, color: COLORES_RESULTADO[i % COLORES_RESULTADO.length]
    }))

    // Por curso (top 8)
    const porCurso: Record<string, number> = {}
    rows.filter(r => r.resultado === 'exitoso').forEach(r => {
      const c = r.curso || 'Sin curso'
      porCurso[c] = (porCurso[c] || 0) + 1
    })
    const cursos: DonutData[] = Object.entries(porCurso)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v], i) => ({ label: k, value: v, color: COLORES_CURSOS[i % COLORES_CURSOS.length] }))

    // Por notebook (top 8)
    const porNotebook: Record<string, number> = {}
    rows.forEach(r => {
      const n = r.notebook_id || 'Desconocido'
      porNotebook[n] = (porNotebook[n] || 0) + 1
    })
    const notebooks: DonutData[] = Object.entries(porNotebook)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v], i) => ({ label: k, value: v, color: COLORES_NOTEBOOKS[i % COLORES_NOTEBOOKS.length] }))

    // Por hora del día
    const porHora: Record<number, number> = {}
    rows.forEach(r => {
      const h = new Date(r.timestamp_inicio).getHours()
      porHora[h] = (porHora[h] || 0) + 1
    })
    const porHoraData: DonutData[] = Object.entries(porHora)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, v], i) => ({
        label: `${h.padStart ? h : h}:00 hrs`,
        value: v,
        color: COLORES_HORA[Number(h) % COLORES_HORA.length]
      }))

    setStats({ resultados, cursos, notebooks, porHora: porHoraData })
    setLoadingStats(false)
  }

  async function exportar(tipo: string) {
    setGenerando(tipo)
    try {
      const XLSX = await import('xlsx')
      let data: any[] = []

      if (tipo === 'accesos' || tipo === 'fallidos') {
        let q = supabase.from('accesos').select('*')
          .gte('timestamp_inicio', params.desde + 'T00:00:00')
          .lte('timestamp_inicio', params.hasta + 'T23:59:59')
          .order('timestamp_inicio', { ascending: false })
        if (tipo === 'fallidos') q = q.eq('resultado', 'fallido')
        if (params.notebook) q = q.eq('notebook_id', params.notebook)
        if (params.sala)     q = q.eq('sala', params.sala)
        if (params.curso)    q = q.eq('curso', params.curso)
        const { data: rows } = await q
        data = (rows || []).map(r => ({
          'Fecha':       new Date(r.timestamp_inicio).toLocaleDateString('es-CL'),
          'Hora inicio': new Date(r.timestamp_inicio).toLocaleTimeString('es-CL'),
          'Hora fin':    r.timestamp_fin ? new Date(r.timestamp_fin).toLocaleTimeString('es-CL') : '',
          'Duración (min)': r.duracion_minutos || '',
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
        const { data: rows } = await supabase.from('alertas').select('*')
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
        const { data: rows } = await supabase.from('accesos').select('curso, resultado, duracion_minutos')
          .gte('timestamp_inicio', params.desde + 'T00:00:00')
          .lte('timestamp_inicio', params.hasta + 'T23:59:59')
          .eq('resultado', 'exitoso')
        const conteo: Record<string, { total: number; minutos: number }> = {}
        for (const r of rows || []) {
          const c = r.curso || 'Sin curso'
          if (!conteo[c]) conteo[c] = { total: 0, minutos: 0 }
          conteo[c].total++
          conteo[c].minutos += r.duracion_minutos || 0
        }
        data = Object.entries(conteo).sort((a, b) => b[1].total - a[1].total)
          .map(([curso, d]) => ({
            'Curso': curso,
            'Total accesos': d.total,
            'Minutos totales': Math.round(d.minutos),
          }))
      }

      if (data.length === 0) { alert('No hay datos para exportar.'); setGenerando(null); return }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, tipo)
      XLSX.writeFile(wb, `control_acceso_${tipo}_${params.desde}_${params.hasta}.xlsx`)
    } catch (e) {
      alert('Error al generar el reporte')
    }
    setGenerando(null)
  }

  const reportes = [
    { id: 'accesos',       label: 'Todos los accesos',    desc: 'Historial completo con fecha, hora, duración', color: 'blue'  },
    { id: 'fallidos',      label: 'Accesos fallidos',     desc: 'Solo los intentos rechazados',                 color: 'red'   },
    { id: 'alertas',       label: 'Alertas de seguridad', desc: 'Eventos de alerta del período',                color: 'amber' },
    { id: 'uso_por_curso', label: 'Uso por curso',        desc: 'Resumen de accesos y tiempo por curso',        color: 'green' },
  ]
  const colorMap: Record<string, string> = {
    blue: 'border-blue-900/50 hover:border-blue-700', red: 'border-red-900/50 hover:border-red-700',
    amber: 'border-amber-900/50 hover:border-amber-700', green: 'border-emerald-900/50 hover:border-emerald-700',
  }
  const iconMap: Record<string, string> = { blue: '≡', red: '✗', amber: '⚠', green: '◑' }

  const totalAccesos = stats ? stats.resultados.reduce((s, d) => s + d.value, 0) : 0

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Reportes</h1>
        <p className="text-slate-600 text-sm">Exportar datos y estadísticas en tiempo real</p>
      </div>

      {/* Filtros */}
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-6">
        <h3 className="text-slate-500 text-xs uppercase tracking-widest mb-4">Parámetros</h3>
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
            <label className="text-slate-600 text-xs block mb-1">Curso</label>
            <input className="input-dark" placeholder="3° A Medio" value={params.curso}
              onChange={e => setParams(p => ({ ...p, curso: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Notebook</label>
            <input className="input-dark" placeholder="NB-SALA-01" value={params.notebook}
              onChange={e => setParams(p => ({ ...p, notebook: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Sala</label>
            <input className="input-dark" placeholder="Sala de Computacion" value={params.sala}
              onChange={e => setParams(p => ({ ...p, sala: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Cards exportar */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        {reportes.map(r => (
          <button key={r.id} onClick={() => exportar(r.id)} disabled={generando === r.id}
            className={`text-left bg-[#0d1520] border rounded-xl p-5 transition-colors ${colorMap[r.color]} ${generando === r.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
            <div className="text-2xl mb-3 opacity-40">{iconMap[r.color]}</div>
            <div className="text-slate-200 font-medium text-sm mb-1">{r.label}</div>
            <div className="text-slate-600 text-xs mb-4">{r.desc}</div>
            <div className={`text-xs font-semibold ${generando === r.id ? 'text-slate-500' : 'text-blue-500'}`}>
              {generando === r.id ? 'Generando...' : '↓ Exportar .xlsx'}
            </div>
          </button>
        ))}
      </div>

      {/* Gráficos donut */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-slate-200 font-semibold text-lg">Estadísticas visuales</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Actualizando en tiempo real
        </div>
      </div>

      {loadingStats ? (
        <div className="text-slate-600 text-sm text-center py-12">Cargando estadísticas...</div>
      ) : !stats ? null : (
        <div className="grid grid-cols-2 gap-5">
          <DonutChart
            data={stats.resultados}
            titulo="Resultados de acceso"
            total={totalAccesos}
          />
          <DonutChart
            data={stats.cursos}
            titulo="Accesos por curso"
            total={stats.cursos.reduce((s, d) => s + d.value, 0)}
          />
          <DonutChart
            data={stats.notebooks}
            titulo="Uso por notebook"
            total={stats.notebooks.reduce((s, d) => s + d.value, 0)}
          />
          <DonutChart
            data={stats.porHora}
            titulo="Accesos por hora del día"
            total={stats.porHora.reduce((s, d) => s + d.value, 0)}
          />
        </div>
      )}
    </div>
  )
}
