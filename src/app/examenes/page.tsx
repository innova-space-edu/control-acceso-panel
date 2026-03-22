'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface ExamenKiosk {
  id: string
  exam_code: string
  exam_url: string
  exam_title: string
  sala: string
  creado_por: string
  estado: 'activo' | 'cerrado'
  cerrar_ahora: boolean
  duracion_min: number
  created_at: string
  closed_at: string | null
}

// ── Helper: extrae el code del link ───────────────────────────────────────────
function extraerCode(url: string): string {
  const m = url.match(/\/examen\/p\/([^/?#]+)/)
  return m ? m[1] : ''
}

// ── Duración formateada ────────────────────────────────────────────────────────
function elapsed(desde: string): string {
  const diff = Math.floor((Date.now() - new Date(desde).getTime()) / 1000)
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

// ════════════════════════════════════════════════════════════════════════════════
export default function ExamenesPage() {
  const [examenes, setExamenes] = useState<ExamenKiosk[]>([])
  const [salas,    setSalas]    = useState<string[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tick,     setTick]     = useState(0)

  // Formulario
  const [fUrl,    setFUrl]    = useState('')
  const [fTitle,  setFTitle]  = useState('')
  const [fSala,   setFSala]   = useState('')
  const [fDur,    setFDur]    = useState('60')
  const [fAdmin,  setFAdmin]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [error,   setError]   = useState('')

  // Estado de filtro
  const [filtro, setFiltro] = useState<'activos' | 'todos'>('activos')
  const [cerrando, setCerrando] = useState<string | null>(null)

  // Ticker para elapsed time
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(iv)
  }, [])

  // Cargar salas desde notebooks
  useEffect(() => {
    async function cargarSalas() {
      const { data } = await supabase.from('notebooks').select('sala')
      if (data) {
        const uniqueSalas = [...new Set(data.map((n: any) => n.sala).filter(Boolean))]
        setSalas(uniqueSalas as string[])
        if (uniqueSalas.length > 0 && !fSala) setFSala(uniqueSalas[0] as string)
      }
    }
    cargarSalas()
  }, [])

  // Cargar exámenes + realtime
  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('examenes_kiosk_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'examenes_kiosk' }, cargar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [filtro])

  async function cargar() {
    setLoading(true)
    let q = supabase
      .from('examenes_kiosk')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (filtro === 'activos') q = q.eq('estado', 'activo')
    const { data, error: e } = await q
    if (!e) setExamenes(data || [])
    setLoading(false)
  }

  // ── Crear examen ────────────────────────────────────────────────────────────
  async function crearExamen() {
    setError('')
    const code = extraerCode(fUrl.trim())
    if (!code) {
      setError('URL inválida. Debe ser un link de examen tipo: .../examen/p/ABC123')
      return
    }
    if (!fSala) {
      setError('Selecciona una sala')
      return
    }

    // Verificar si ya hay un examen activo en esa sala
    const { data: existing } = await supabase
      .from('examenes_kiosk')
      .select('id')
      .eq('sala', fSala)
      .eq('estado', 'activo')
      .limit(1)
    
    if (existing && existing.length > 0) {
      setError('Ya hay un examen activo en esa sala. Ciérralo primero.')
      return
    }

    setSaving(true)
    const { error: e } = await supabase.from('examenes_kiosk').insert({
      exam_code:   code,
      exam_url:    fUrl.trim(),
      exam_title:  fTitle.trim() || `Examen ${code}`,
      sala:        fSala,
      creado_por:  fAdmin.trim() || 'Admin',
      duracion_min: parseInt(fDur) || 60,
      estado:      'activo',
      cerrar_ahora: false,
    })

    setSaving(false)
    if (e) {
      setError('Error al crear: ' + e.message)
    } else {
      setMsg('✓ Examen iniciado en la sala. Los kiosks abrirán el navegador automáticamente.')
      setFUrl('')
      setFTitle('')
      setTimeout(() => setMsg(''), 6000)
      cargar()
    }
  }

  // ── Cerrar examen ───────────────────────────────────────────────────────────
  async function cerrarExamen(id: string) {
    setCerrando(id)
    const { error: e } = await supabase
      .from('examenes_kiosk')
      .update({ estado: 'cerrado', cerrar_ahora: true, closed_at: new Date().toISOString() })
      .eq('id', id)
    
    setCerrando(null)
    if (e) {
      setError('Error al cerrar: ' + e.message)
    } else {
      setMsg('✓ Señal de cierre enviada. Los kiosks y la página del examen se cerrarán en segundos.')
      setTimeout(() => setMsg(''), 6000)
      cargar()
    }
  }

  const activos = examenes.filter(e => e.estado === 'activo')

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-100 font-semibold text-xl">Exámenes en Sala</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Control de exámenes con pantalla completa y cierre remoto
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${activos.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-slate-400 text-sm">{activos.length} activo{activos.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Mensajes ─────────────────────────────────────────────────────── */}
      {msg   && <div className="bg-green-900/30 border border-green-700/40 text-green-400 text-sm px-4 py-3 rounded-lg">{msg}</div>}
      {error && <div className="bg-red-900/30 border border-red-700/40 text-red-400 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* ── Formulario crear examen ───────────────────────────────────────── */}
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-6">
        <h2 className="text-slate-200 font-semibold mb-4 flex items-center gap-2">
          <span>✎</span> Iniciar examen en sala
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* URL */}
          <div className="md:col-span-2">
            <label className="text-slate-500 text-xs font-medium block mb-1.5">
              LINK DEL EXAMEN (de EduAI Platform)
            </label>
            <input
              type="text"
              value={fUrl}
              onChange={e => setFUrl(e.target.value)}
              placeholder="https://eduaiplatformclon.vercel.app/examen/p/kE3RtR"
              className="w-full bg-[#060a10] border border-[#1a2a40] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-700/50 font-mono"
            />
            {fUrl && (
              <p className="text-slate-600 text-xs mt-1">
                Código detectado:{' '}
                <span className="text-blue-400 font-mono">{extraerCode(fUrl) || '(no detectado)'}</span>
              </p>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">
              TÍTULO (opcional)
            </label>
            <input
              type="text"
              value={fTitle}
              onChange={e => setFTitle(e.target.value)}
              placeholder="Ej: Prueba Ciencias 8°A"
              className="w-full bg-[#060a10] border border-[#1a2a40] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-700/50"
            />
          </div>

          {/* Sala */}
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">
              SALA
            </label>
            <select
              value={fSala}
              onChange={e => setFSala(e.target.value)}
              className="w-full bg-[#060a10] border border-[#1a2a40] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-700/50"
            >
              {salas.length === 0 && <option value="">Cargando salas...</option>}
              {salas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Duración */}
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">
              DURACIÓN ESTIMADA (minutos)
            </label>
            <input
              type="number"
              min="5"
              max="240"
              value={fDur}
              onChange={e => setFDur(e.target.value)}
              className="w-full bg-[#060a10] border border-[#1a2a40] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-700/50"
            />
          </div>

          {/* Admin */}
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">
              AUTORIZADO POR
            </label>
            <input
              type="text"
              value={fAdmin}
              onChange={e => setFAdmin(e.target.value)}
              placeholder="Nombre del docente o admin"
              className="w-full bg-[#060a10] border border-[#1a2a40] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-700/50"
            />
          </div>
        </div>

        {/* Alerta informativa */}
        <div className="mt-4 bg-blue-900/10 border border-blue-800/30 rounded-lg px-4 py-3 text-blue-400 text-xs space-y-1">
          <p className="font-semibold">¿Cómo funciona?</p>
          <p>Al iniciar, todos los kiosks de la sala abrirán el examen en pantalla completa automáticamente.</p>
          <p>El estudiante <strong>no puede cerrar la pantalla ni cambiar de aplicación</strong>. Solo el tiempo o este panel pueden cerrar el examen.</p>
        </div>

        <button
          onClick={crearExamen}
          disabled={saving || !fUrl.trim() || !fSala}
          className="mt-4 px-6 py-2.5 bg-blue-700/80 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
        >
          {saving ? 'Iniciando...' : '▶ Iniciar examen en sala'}
        </button>
      </div>

      {/* ── Lista de exámenes ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-slate-200 font-semibold">Sesiones de examen</h2>
          <div className="flex rounded-lg overflow-hidden border border-[#1a2a40] text-xs">
            {(['activos', 'todos'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 capitalize transition-colors ${filtro === f ? 'bg-blue-900/50 text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-slate-600 text-sm py-8 text-center">Cargando...</div>
        ) : examenes.length === 0 ? (
          <div className="text-slate-600 text-sm py-12 text-center bg-[#0d1520] border border-[#1a2a40] rounded-xl">
            No hay exámenes {filtro === 'activos' ? 'activos' : ''} en este momento.
          </div>
        ) : (
          <div className="space-y-3">
            {examenes.map(ex => (
              <div
                key={ex.id}
                className={`bg-[#0d1520] border rounded-xl p-5 flex items-center justify-between gap-4 ${
                  ex.estado === 'activo'
                    ? 'border-blue-800/40'
                    : 'border-[#1a2a40] opacity-60'
                }`}
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      ex.estado === 'activo'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {ex.estado === 'activo' ? '● ACTIVO' : '○ CERRADO'}
                    </span>
                    <span className="text-slate-300 text-sm font-semibold truncate">
                      {ex.exam_title}
                    </span>
                    <span className="text-slate-600 text-xs font-mono">{ex.exam_code}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    <span>🏫 {ex.sala}</span>
                    <span>⏱ {ex.duracion_min} min</span>
                    <span>👤 {ex.creado_por}</span>
                    {ex.estado === 'activo' && (
                      <span className="text-blue-400">⟳ {elapsed(ex.created_at)}</span>
                    )}
                    {ex.estado === 'cerrado' && ex.closed_at && (
                      <span>Cerrado {new Date(ex.closed_at).toLocaleTimeString('es-CL')}</span>
                    )}
                  </div>

                  <a
                    href={ex.exam_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-xs mt-1 block truncate hover:underline"
                  >
                    {ex.exam_url}
                  </a>
                </div>

                {/* Acción */}
                {ex.estado === 'activo' && (
                  <button
                    onClick={() => cerrarExamen(ex.id)}
                    disabled={cerrando === ex.id}
                    className="flex-shrink-0 px-4 py-2 bg-red-900/40 hover:bg-red-900/70 border border-red-800/50 text-red-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {cerrando === ex.id ? 'Cerrando...' : '⏹ Cerrar examen'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
