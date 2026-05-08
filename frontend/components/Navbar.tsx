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

  // Pages cấp cho user, fallback theo role nếu chưa có
  const defaultPagesByRole: Record<string, string[]> = {
    admin: ['schedules','swaps','cham-truc','ho-tro-truc','users','departments'],
    department_lead: ['schedules','swaps','users'],
    staff: ['schedules','swaps'],
  }
  // Admin LUÔN thấy tất cả link (bỏ qua user.pages cũ có thể outdated)
  const allowedPages: string[] = user?.role === 'admin'
    ? defaultPagesByRole.admin
    : (user?.pages || defaultPagesByRole[user?.role] || ['schedules'])

  const allLinks = [
    { href: '/schedules',   key: 'schedules',   label: 'Lịch Trực' },
    { href: '/swaps',       key: 'swaps',       label: 'Đổi Trực' },
    { href: '/cham-truc',   key: 'cham-truc',   label: 'Chấm Trực' },
    { href: '/ho-tro-truc', key: 'ho-tro-truc', label: 'Hỗ trợ trực' },
    { href: '/users',       key: 'users',       label: 'Nhân viên' },
    { href: '/departments', key: 'departments', label: 'Khoa/Phòng' },
  ]
  const links = allLinks.filter(l => allowedPages.includes(l.key))

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="TTYT Liên Chiểu" className="h-9 w-9 object-contain"/>
            <div className="leading-tight">
              <div className="font-bold text-blue-700 text-sm">Lịch Trực</div>
              <div className="text-[10px] text-gray-500 -mt-0.5">TTYT KV Liên Chiểu</div>
            </div>
          </div>
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
