'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, departmentApi, userApi } from '@/lib/api'
import { getDaysInMonth, format } from 'date-fns'
import { vi } from 'date-fns/locale'

const DEPT_ORDER = [
  'CC-HSTC','HL-CC','CC-NGOAI','NGOAI','GMHS','CC-SAN','SAN','NOI','NHI','YHCT','LCK','SAM','CT','XQUANG','XN','VP','LX','HL'
]

const titleRank = (title?: string) => {
  if (!title) return 99
  const t = title.toLowerCase()
  if (t.includes('bác sĩ') || t === 'bs') return 0
  if (t.includes('lãnh đạo')) return 1
  if (t.includes('điều dưỡng') || t.includes('hộ sinh') || t.includes('kỹ thuật')) return 2
  return 50
}

const SHIFT_CODE_COLORS: Record<string, string> = {
  T: 'bg-blue-100 text-blue-800',
  C: 'bg-green-100 text-green-800',
  TC: 'bg-teal-100 text-teal-800',
  CC: 'bg-red-100 text-red-800',
  LC: 'bg-yellow-100 text-yellow-800',
  LHS: 'bg-purple-100 text-purple-800',
  THS: 'bg-indigo-100 text-indigo-800',
  L: 'bg-orange-100 text-orange-800',
}

export default function ChamTrucPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [schedules, setSchedules] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('')
  const [printMode, setPrintMode] = useState(false)

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    if (parsed.role !== 'admin') { router.push('/schedules'); return }
    setAuthUser(parsed)
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, u] = await Promise.all([
        scheduleApi.list({ year, month }),
        departmentApi.list(),
        userApi.list(),
      ])
      setSchedules(s)
      const sorted = [...d].sort((a,b) => {
        const ai = DEPT_ORDER.indexOf(a.code), bi = DEPT_ORDER.indexOf(b.code)
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
        if (ai === -1) return 1; if (bi === -1) return -1
        return ai - bi
      })
      setDepartments(sorted)
      setAllUsers(u)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }, [year, month, router])

  useEffect(() => { if (authUser) load() }, [load, authUser])

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const days = Array.from({length: daysInMonth}, (_,i) => i+1)

  // Build map: userId -> day -> shiftCode
  type AttendMap = Record<string, Record<number, string>>
  const attendMap: AttendMap = {}
  schedules.forEach(s => {
    const day = new Date(s.shiftDate).getDate()
    if (!attendMap[s.userId]) attendMap[s.userId] = {}
    const code = s.shiftType?.code || 'T'
    attendMap[s.userId][day] = code
  })

  // Count totals per user
  const countShifts = (userId: string) => Object.keys(attendMap[userId] || {}).length

  // Group users by department (from their home dept, not duty dept)
  const deptUsers: Record<string, any[]> = {}
  allUsers.forEach(u => {
    const deptCode = u.department?.code || 'OTHER'
    if (!deptUsers[deptCode]) deptUsers[deptCode] = []
    deptUsers[deptCode].push(u)
  })

  // Which users had any schedule this month
  const activeUserIds = new Set(schedules.map(s => s.userId))

  // Filter departments
  const displayDepts = filterDept
    ? departments.filter(d => d.id === filterDept)
    : departments

  // Day of week labels
  const dayLabels = days.map(d => {
    const date = new Date(year, month-1, d)
    const dow = ['CN','T2','T3','T4','T5','T6','T7'][date.getDay()]
    const isWeekend = [0,6].includes(date.getDay())
    return { d, dow, isWeekend }
  })

  if (!authUser) return null

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {!printMode && <Navbar />}
      <div className={`mx-auto px-3 py-4 ${printMode ? 'px-0 py-0 max-w-none' : 'max-w-[1600px]'}`}>
        {/* Header */}
        {!printMode && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div>
              <h1 className="text-lg font-bold text-gray-800">Chấm Trực</h1>
              <p className="text-xs text-gray-500">Bảng chấm công thường trực chuyên môn y tế</p>
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <select value={month} onChange={e=>setMonth(+e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm">
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
              <select value={year} onChange={e=>setYear(+e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm">
                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm">
                <option value="">Tất cả khoa</option>
                {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={()=>setPrintMode(true)}
                className="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm hover:bg-gray-800">
                🖨️ In
              </button>
            </div>
          </div>
        )}

        {printMode && (
          <div className="flex justify-between items-center mb-4 print:hidden">
            <div>
              <h1 className="text-base font-bold">TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</h1>
              <p className="text-sm font-semibold">BẢNG CHẤM CÔNG THƯỜNG TRỰC - THÁNG {month}/{year}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>window.print()} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">In trang</button>
              <button onClick={()=>setPrintMode(false)} className="border px-3 py-1 rounded text-sm">Thoát</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div className="space-y-6">
            {displayDepts.map(dept => {
              const usersInDept = (deptUsers[dept.code] || []).filter(u => activeUserIds.has(u.id) || !filterDept)
              if (usersInDept.length === 0 && !activeUserIds.size) return null
              // Also get users who had schedules in this dept (duty dept)
              const dutyUserIds = new Set(
                schedules.filter(s => s.departmentId === dept.id).map(s => s.userId)
              )
              const allDeptUsers = allUsers
                .filter(u => u.departmentId === dept.id || dutyUserIds.has(u.id))
                .sort((a, b) => {
                  const ra = titleRank(a.title), rb = titleRank(b.title)
                  if (ra !== rb) return ra - rb
                  return (a.fullName||'').localeCompare(b.fullName||'')
                })
              if (allDeptUsers.length === 0) return null

              return (
                <div key={dept.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-blue-700 text-white px-4 py-2">
                    <h2 className="font-bold text-sm uppercase tracking-wide">{dept.name}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 border-r min-w-[50px]">STT</th>
                          <th className="sticky left-12 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 border-r min-w-[160px]">Họ và tên</th>
                          {dayLabels.map(({d, dow, isWeekend}) => (
                            <th key={d} className={`px-1 py-2 text-center border-r font-medium w-8 ${isWeekend ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}>
                              <div>{d}</div>
                              <div className="text-[9px] opacity-70">{dow}</div>
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-bold text-gray-700 border-r min-w-[50px]">Tổng</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 min-w-[80px]">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allDeptUsers.map((u, idx) => {
                          const userAttend = attendMap[u.id] || {}
                          const total = countShifts(u.id)
                          return (
                            <tr key={u.id} className="hover:bg-blue-50/20">
                              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-gray-500 border-r text-center">{idx+1}</td>
                              <td className="sticky left-12 z-10 bg-white px-3 py-1.5 font-medium text-gray-800 border-r whitespace-nowrap">
                                {u.fullName}
                                {u.title && <span className="ml-1 text-gray-400 font-normal text-[10px]">({u.title})</span>}
                              </td>
                              {dayLabels.map(({d, isWeekend}) => {
                                const code = userAttend[d]
                                const colorClass = code ? (SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-800') : ''
                                return (
                                  <td key={d} className={`px-0.5 py-1 text-center border-r ${isWeekend ? 'bg-orange-50/30' : ''}`}>
                                    {code && (
                                      <span className={`inline-block rounded px-1 py-0.5 text-[10px] font-semibold ${colorClass}`}>
                                        {code}
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                              <td className="px-2 py-1.5 text-center font-bold text-blue-700 border-r">{total || '-'}</td>
                              <td className="px-3 py-1.5 text-gray-400 text-[10px]"></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}

            {schedules.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>Chưa có dữ liệu chấm trực tháng {month}/{year}</p>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {!printMode && (
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            {Object.entries(SHIFT_CODE_COLORS).map(([code, cls]) => (
              <span key={code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${cls}`}>
                <span className="font-bold">{code}</span>
                <span className="opacity-70">= {
                  {T:'Thường trực',C:'Ca',TC:'Thứ tư ca',CC:'Ca cuối',LC:'Lễ ca',LHS:'Lễ hội sản',THS:'Thứ tư hội sản',L:'Lễ'}[code]||''
                }</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          nav { display: none !important; }
          body { font-size: 10px; }
          table { font-size: 9px; }
        }
      `}</style>
    </div>
  )
}
