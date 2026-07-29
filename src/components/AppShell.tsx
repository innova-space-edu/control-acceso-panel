'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/login') return <main className="min-h-screen w-full">{children}</main>
  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-56 p-6 xl:p-8 min-h-screen overflow-x-hidden">{children}</main>
    </>
  )
}
