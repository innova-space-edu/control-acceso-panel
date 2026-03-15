import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Panel Admin — Control de Acceso',
  description: 'Sistema de control de acceso escolar',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#060a10] text-slate-300 min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-56 p-8 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}