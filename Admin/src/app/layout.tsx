import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemeRegistry } from '@/components/ThemeRegistry'

export const metadata: Metadata = {
  title: 'Abapfy Admin',
  description: 'Dashboard administrativo do Abapfy — usuários, uso e custo estimado.'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  )
}
