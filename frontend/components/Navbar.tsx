'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null
  const user = userStr ? JSON.parse(userStr) : null

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    router.push('/login')
  }

  const links = [
    { href: '/schedules', label: 'Lịch Trực' },
    { href: '/swaps', label: 'Đổi Trực' },
    ...(user?.role === 'admin'
      ? [{ href: '/cham-truc', label: 'Chấm Trực' }]
      : []),
    ...(user?.role === 'admin' || user?.role === 'department_lead'
      ? [{ href: '/users', label: 'Nhân viên' }]
      : []),
    ...(user?.role === 'admin'
      ? [{ href: '/departments', label: 'Khoa/Phòng' }]
      : []),
  ]

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-blue-700 text-lg">🏥 Lịch Trực</span>
          <div className="flex gap-1">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith(l.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.fullName}</span>
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </nav>
  )
}
