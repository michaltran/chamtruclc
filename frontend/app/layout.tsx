import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hệ thống Quản lý Lịch Trực',
  description: 'Quản lý lịch trực bệnh viện',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
