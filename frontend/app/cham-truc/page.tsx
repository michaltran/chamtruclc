'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, departmentApi, userApi } from '@/lib/api'
import { getDaysInMonth } from 'date-fns'

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
  T:   'bg-blue-100 text-blue-800',
  C:   'bg-green-100 text-green-800',
  L:   'bg-orange-100 text-orange-800',
  TC:  'bg-teal-100 text-teal-800',
  CC:  'bg-red-100 text-red-800',
  LC:  'bg-yellow-100 text-yellow-800',
  THS: 'bg-indigo-100 text-indigo-800',
  CHS: 'bg-purple-100 text-purple-800',
  LHS: 'bg-pink-100 text-pink-800',
}

const SHIFT_CODE_NAMES: Record<string, string> = {
  T:   'Trực bình thường trong tuần 24/24',
  C:   'Trực bình thường thứ 7, CN 24/24',
  L:   'Trực bình thường ngày Lễ 24/24',
  TC:  'Trực cấp cứu trong tuần 24/24',
  CC:  'Trực cấp cứu thứ 7, CN 24/24',
  LC:  'Trực cấp cứu ngày Lễ 24/24',
  THS: 'Phiên trực ngày thường hồi sức hồi tỉnh 24/24',
  CHS: 'Phiên trực thứ 7, CN hồi sức hồi tỉnh 24/24',
  LHS: 'Phiên trực ngày Lễ, tết hồi sức hồi tỉnh 24/24',
}

// Đúng layout sheet "Chấm trực ALL T*" của TTYT KV Liên Chiểu:
//   Group "Ngày thường" (TC | T | THS)
//   Group "T7, CN"      (CC | C | CHS)
//   Group "Lễ, tết"     (LC | L | LHS)
//   TC ngày CC     = TC + CC + LC      (tổng phiên cấp cứu)
//   TC ngày thường = T  + C  + L       (tổng phiên thường)
//   TC trực Hồi sức= THS+ CHS+ LHS     (tổng phiên hồi sức)
//   Tổng cộng      = sum 9 ô đếm
const COUNT_COLS = ['TC','T','THS','CC','C','CHS','LC','L','LHS'] as const
type CountCode = typeof COUNT_COLS[number]

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

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    // Cho phép truy cập nếu role=admin HOẶC pages chứa 'cham-truc'
    const allowed = parsed.role === 'admin' || (parsed.pages || []).includes('cham-truc')
    if (!allowed) { router.push('/schedules'); return }
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

  const daysInMonth = useMemo(() => getDaysInMonth(new Date(year, month - 1)), [year, month])
  const days = useMemo(() => Array.from({length: daysInMonth}, (_,i) => i+1), [daysInMonth])

  const dayLabels = useMemo(() => days.map(d => {
    const date = new Date(year, month-1, d)
    const dow = ['CN','T2','T3','T4','T5','T6','T7'][date.getDay()]
    const isWeekend = [0,6].includes(date.getDay())
    return { d, dow, isWeekend }
  }), [days, year, month])

  // attendMap: userId -> day -> shiftCode
  // counts: userId -> { TC,T,THS,CC,C,CHS,LC,L,LHS }
  const { attendMap, counts } = useMemo(() => {
    const a: Record<string, Record<number, string>> = {}
    const c: Record<string, Record<CountCode, number>> = {}
    for (const s of schedules) {
      const day = new Date(s.shiftDate).getDate()
      const code = (s.shiftType?.code || 'T') as CountCode
      if (!a[s.userId]) a[s.userId] = {}
      a[s.userId][day] = code
      if (!c[s.userId]) c[s.userId] = { TC:0,T:0,THS:0,CC:0,C:0,CHS:0,LC:0,L:0,LHS:0 }
      if (COUNT_COLS.includes(code)) c[s.userId][code]++
    }
    return { attendMap: a, counts: c }
  }, [schedules])

  const dutyByDept = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const s of schedules) {
      if (!m[s.departmentId]) m[s.departmentId] = new Set()
      m[s.departmentId].add(s.userId)
    }
    return m
  }, [schedules])

  const displayDepts = filterDept
    ? departments.filter(d => d.id === filterDept)
    : departments

  if (!authUser) return null

  const sumGroup = (c: Record<CountCode, number> | undefined, codes: CountCode[]) =>
    codes.reduce((acc, k) => acc + (c?.[k] || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <Navbar />
      <div className="mx-auto px-3 py-4 max-w-[1800px]">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
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
            <button onClick={()=>window.print()}
              className="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm hover:bg-gray-800">
              🖨️ In
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block text-center mb-3 print:mb-2">
          <div className="text-xs">TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
          <div className="text-xs">PHÒNG KẾ HOẠCH - NGHIỆP VỤ</div>
          <div className="text-sm font-bold mt-1">BẢNG CHẤM CÔNG THƯỜNG TRỰC CHUYÊN MÔN Y TẾ ĐƯỢC PHỤ CẤP</div>
          <div className="text-xs italic">Tháng {month}/{year}</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div className="space-y-6 print:space-y-3">
            {displayDepts.map(dept => {
              const dutyUserIds = dutyByDept[dept.id] || new Set()
              const allDeptUsers = allUsers
                .filter(u => u.departmentId === dept.id || dutyUserIds.has(u.id))
                .sort((a, b) => {
                  const ra = titleRank(a.title), rb = titleRank(b.title)
                  if (ra !== rb) return ra - rb
                  return (a.fullName||'').localeCompare(b.fullName||'')
                })
              if (allDeptUsers.length === 0) return null

              return (
                <div key={dept.id} className="bg-white rounded-xl shadow-sm overflow-hidden print:rounded-none print:shadow-none print:break-inside-avoid">
                  <div className="bg-blue-700 text-white px-4 py-2 print:bg-gray-200 print:text-black">
                    <h2 className="font-bold text-sm uppercase tracking-wide">{dept.name}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        {/* Row 1: top group headers */}
                        <tr className="bg-gray-50 border-b">
                          <th rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-2 py-1 text-center font-semibold text-gray-700 border w-10">STT</th>
                          <th rowSpan={2} className="sticky left-10 z-10 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-700 border min-w-[160px]">Họ và tên</th>
                          {dayLabels.map(({d, dow, isWeekend}) => (
                            <th key={d} rowSpan={2} className={`px-1 py-1 text-center border font-medium w-7 ${isWeekend ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}>
                              <div className="text-[10px]">{d}</div>
                              <div className="text-[8px] opacity-70">{dow}</div>
                            </th>
                          ))}
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-blue-50">Ngày thường</th>
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-orange-50">Ngày thứ 7, CN</th>
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-yellow-50">Ngày lễ, tết</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-red-700 bg-red-50 w-12">TC ngày CC</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-blue-700 bg-blue-50 w-12">TC ngày thường</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-indigo-700 bg-indigo-50 w-12">TC trực Hồi sức</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-gray-800 bg-gray-100 w-12">Tổng cộng</th>
                        </tr>
                        {/* Row 2: 9 sub-codes */}
                        <tr className="bg-gray-50 border-b">
                          {(['TC','T','THS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                          {(['CC','C','CHS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                          {(['LC','L','LHS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allDeptUsers.map((u, idx) => {
                          const userAttend = attendMap[u.id] || {}
                          const userCounts = counts[u.id]
                          const ccTotal = sumGroup(userCounts, ['TC','CC','LC'])
                          const normTotal = sumGroup(userCounts, ['T','C','L'])
                          const hsTotal = sumGroup(userCounts, ['THS','CHS','LHS'])
                          const grandTotal = ccTotal + normTotal + hsTotal
                          return (
                            <tr key={u.id} className="hover:bg-blue-50/20">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-gray-500 border text-center">{idx+1}</td>
                              <td className="sticky left-10 z-10 bg-white px-2 py-1 font-medium text-gray-800 border whitespace-nowrap">
                                {u.fullName}
                                {u.title && <span className="ml-1 text-gray-400 font-normal text-[10px]">({u.title})</span>}
                              </td>
                              {dayLabels.map(({d, isWeekend}) => {
                                const code = userAttend[d]
                                const colorClass = code ? (SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-800') : ''
                                return (
                                  <td key={d} className={`px-0.5 py-0.5 text-center border ${isWeekend ? 'bg-orange-50/30' : ''}`}>
                                    {code && (
                                      <span className={`inline-block rounded px-0.5 text-[9px] font-bold ${colorClass}`}>
                                        {code}
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                              {/* 9 đếm theo mã */}
                              {COUNT_COLS.map(code => (
                                <td key={code} className="px-1 py-1 text-center border text-[10px]">
                                  {userCounts?.[code] || ''}
                                </td>
                              ))}
                              {/* 4 cột tổng */}
                              <td className="px-1 py-1 text-center border bg-red-50 font-bold text-red-700">{ccTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-blue-50 font-bold text-blue-700">{normTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-indigo-50 font-bold text-indigo-700">{hsTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-gray-100 font-bold text-gray-800">{grandTotal || ''}</td>
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

        {/* Legend - 9 ký hiệu chấm trực */}
        <div className="bg-white rounded-xl shadow-sm p-4 mt-4 print:hidden">
          <h3 className="text-xs font-bold text-gray-700 uppercase mb-2">Ký hiệu chấm trực</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {COUNT_COLS.map(code => (
              <div key={code} className="flex items-center gap-2">
                <span className={`inline-block w-10 text-center px-1 py-0.5 rounded font-bold ${SHIFT_CODE_COLORS[code]}`}>
                  {code}
                </span>
                <span className="text-gray-600 leading-tight">{SHIFT_CODE_NAMES[code]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t text-xs text-gray-600 leading-relaxed">
            <b>Công thức cột tổng:</b><br/>
            • <b className="text-red-700">TC ngày CC</b> = TC + CC + LC (tổng phiên trực cấp cứu)<br/>
            • <b className="text-blue-700">TC ngày thường</b> = T + C + L (tổng phiên trực bình thường)<br/>
            • <b className="text-indigo-700">TC trực Hồi sức</b> = THS + CHS + LHS (tổng phiên hồi sức hồi tỉnh)<br/>
            • <b>Tổng cộng</b> = TC ngày CC + TC ngày thường + TC trực Hồi sức
          </div>
        </div>

        {/* Print footer with signatures */}
        <div className="hidden print:block mt-6">
          <div className="grid grid-cols-3 gap-8 text-xs text-center">
            <div>
              <div className="font-semibold uppercase mb-12">Người lập</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-semibold uppercase mb-12">P. Kế hoạch - Nghiệp vụ</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-semibold uppercase mb-12">Giám đốc</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          nav { display: none !important; }
          body { font-size: 9px; }
          table { font-size: 8px; page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
