'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import { format, startOfWeek, addDays, addWeeks, getDaysInMonth } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

const SHIFT_CODE_COLORS: Record<string, string> = {
  T: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-green-100 text-green-800 border-green-300',
  TC: 'bg-teal-100 text-teal-800 border-teal-300',
  CC: 'bg-red-100 text-red-800 border-red-300',
  L: 'bg-orange-100 text-orange-800 border-orange-300',
  LC: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  THS: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  CHS: 'bg-purple-100 text-purple-800 border-purple-300',
  LHS: 'bg-pink-100 text-pink-800 border-pink-300',
}

export default function PublicSchedulePage() {
  const params = useParams<{ year: string; month: string }>()
  const year = parseInt(params.year)
  const month = parseInt(params.month)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    setLoading(true)
    axios.get(`${API_URL}/public/schedules`, { params: { year, month } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Không tải được lịch trực'))
      .finally(() => setLoading(false))
  }, [year, month])

  const { weekStart, weekDays, maxWeekOffset } = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1)
    const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
    const ws = addWeeks(baseWeek, weekOffset)
    const wd = Array.from({length:7}, (_,i) => addDays(ws, i))
    const dim = getDaysInMonth(new Date(year, month - 1))
    return { weekStart: ws, weekDays: wd, maxWeekOffset: Math.ceil(dim / 7) + 1 }
  }, [year, month, weekOffset])

  const schedMap = useMemo(() => {
    if (!data) return {} as Record<string, Record<string, { bs:any[]; dd:any[] }>>
    const m: Record<string, Record<string, { bs: any[]; dd: any[] }>> = {}
    for (const s of data.schedules) {
      const d = format(new Date(s.shiftDate), 'yyyy-MM-dd')
      const dept = s.departmentId
      if (!m[d]) m[d] = {}
      if (!m[d][dept]) m[d][dept] = { bs: [], dd: [] }
      const t = (s.user?.title || '').toLowerCase()
      const isBs = t.includes('bác sĩ') || t.includes('lãnh đạo')
      ;(isBs ? m[d][dept].bs : m[d][dept].dd).push(s)
    }
    return m
  }, [data])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Đang tải lịch trực...</div>

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <img src="/logo.png" alt="" className="h-16 w-16 mx-auto mb-3 opacity-70"/>
        <h1 className="text-lg font-bold text-gray-700">Không có dữ liệu lịch trực</h1>
        <p className="text-sm text-gray-500 mt-2">
          Lịch trực tháng {month}/{year} chưa được Ban Giám đốc duyệt và công bố.
          Vui lòng quay lại sau.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-[1400px] mx-auto px-3 py-4">
        {/* Header */}
        <div className="text-center mb-4">
          <img src="/logo.png" alt="" className="h-14 w-14 mx-auto mb-2 object-contain"/>
          <div className="text-xs uppercase text-gray-600">SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG</div>
          <div className="text-sm font-bold uppercase text-blue-900">TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
          <h1 className="text-xl font-bold text-gray-800 mt-3 uppercase">
            Lịch Trực Toàn Viện — Tháng {month}/{year}
          </h1>
          <p className="text-xs text-gray-500 italic mt-1">Đã được Ban Giám đốc duyệt và công bố. Trang chỉ xem, không yêu cầu đăng nhập.</p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 shadow-sm mb-2 print:hidden">
          <button onClick={()=>setWeekOffset(w=>Math.max(0,w-1))} disabled={weekOffset===0}
            className="text-gray-600 hover:text-blue-600 disabled:opacity-30 text-base font-bold">‹ Tuần trước</button>
          <span className="text-sm font-semibold text-gray-700">
            {format(weekStart,'dd/MM')} — {format(weekDays[6],'dd/MM/yyyy')} (Tuần {weekOffset+1})
          </span>
          <button onClick={()=>window.print()} className="text-xs text-gray-500 hover:text-blue-600">🖨️ In</button>
          <button onClick={()=>setWeekOffset(w=>Math.min(maxWeekOffset,w+1))}
            className="text-gray-600 hover:text-blue-600 text-base font-bold">Tuần sau ›</button>
        </div>

        <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200 bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-blue-800 to-blue-700 text-white">
                <th rowSpan={2} className="sticky left-0 z-20 bg-blue-800 px-4 py-3 text-left font-bold uppercase tracking-wider min-w-[160px] text-[12px]">
                  Thành phần trực
                </th>
                {weekDays.map(d => {
                  const dow = d.getDay()
                  const isSunday = dow === 0
                  const isSaturday = dow === 6
                  const dowLabel = isSunday ? 'CHỦ NHẬT' : isSaturday ? 'THỨ 7' : `THỨ ${dow + 1}`
                  return (
                    <th key={d.getTime()} colSpan={2}
                      className={`px-2 py-2 text-center border border-blue-400/40 min-w-[130px]
                        ${isSunday ? 'bg-rose-700' : ''}
                        ${isSaturday ? 'bg-orange-600' : ''}`}>
                      <div className="text-[10px] font-medium opacity-80">{dowLabel}</div>
                      <div className="text-[15px] font-bold">{format(d,'dd/MM')}</div>
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-blue-50 text-blue-900 text-[10px]">
                {weekDays.flatMap(d => [
                  <th key={`${d.getTime()}-bs`} className="border border-gray-300 px-1 py-1 font-bold text-blue-700">BS</th>,
                  <th key={`${d.getTime()}-dd`} className="border border-gray-300 px-1 py-1 font-bold text-emerald-700">ĐD/HS/KTV</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {data.departments.map((dept: any, ri: number) => {
                const isLanhDao = dept.code === 'LANHDAO'
                const rowBg = isLanhDao ? 'bg-amber-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                return (
                  <tr key={dept.id} className={`${rowBg} border-b border-gray-300 ${isLanhDao ? 'border-b-2 border-amber-300' : ''}`}>
                    <td className={`sticky left-0 z-10 ${rowBg} px-3 py-2 font-semibold border border-gray-300 text-[11px] uppercase ${isLanhDao ? 'text-amber-800' : 'text-blue-900'}`}>
                      <div className="flex items-center gap-1">
                        {isLanhDao && <span className="text-amber-600">★</span>}
                        <span>{dept.name}</span>
                      </div>
                    </td>
                    {weekDays.flatMap(d => {
                      const dateStr = format(d,'yyyy-MM-dd')
                      const isWeekend = [0,6].includes(d.getDay())
                      const cell = schedMap[dateStr]?.[dept.id] || { bs: [], dd: [] }
                      const renderCell = (items: any[], type: 'BS'|'DD') => (
                        <td key={`${dateStr}-${dept.id}-${type}`}
                          className={`align-top border border-gray-300 px-1 py-1 ${isWeekend ? 'bg-orange-50/40' : ''}`}>
                          <div className="space-y-1 min-h-[44px]">
                            {items.map(s => {
                              const code = s.shiftType?.code || 'T'
                              const codeCls = SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-700 border-gray-300'
                              const tone = isLanhDao ? 'bg-amber-50 border border-amber-300' : type==='BS' ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'
                              return (
                                <div key={s.id} className={`rounded px-1 py-0.5 ${tone}`}>
                                  <div className="flex items-center gap-1 text-[10px]">
                                    <span className={`px-1 rounded text-[9px] font-bold border shrink-0 ${codeCls}`}>{code}</span>
                                    <span className="flex-1 leading-tight font-medium truncate" title={s.user?.fullName}>
                                      {s.user?.fullName}
                                    </span>
                                  </div>
                                  {isLanhDao && s.user?.phone && (
                                    <div className="text-[9px] text-amber-700 font-mono ml-5 mt-0.5">📞 {s.user.phone}</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                      return [renderCell(cell.bs,'BS'), renderCell(cell.dd,'DD')]
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="text-center text-[10px] text-gray-400 mt-4 italic print:mt-2">
          Phòng Kế hoạch - Nghiệp vụ — TTYT KV Liên Chiểu — chamtruclc.vercel.app
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body { font-size: 10px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
