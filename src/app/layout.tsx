import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Centro de Control — Acceso Escolar',
  description: 'Administración, auditoría, seguridad y monitoreo de dispositivos escolares',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#060a10] text-slate-300 min-h-screen flex">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
