'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import { format, startOfWeek, addDays, addWeeks, getDaysInMonth } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

const SHIFT_CODE_COLORS: Record<string, string> = {
  T:   'bg-blue-100 text-blue-800 border-blue-300',
  C:   'bg-green-100 text-green-800 border-green-300',
  L:   'bg-orange-100 text-orange-800 border-orange-300',
  TC:  'bg-teal-100 text-teal-800 border-teal-300',
  CC:  'bg-red-100 text-red-800 border-red-300',
  LC:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  THS: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  CHS: 'bg-purple-100 text-purple-800 border-purple-300',
  LHS: 'bg-pink-100 text-pink-800 border-pink-300',
}

// Khoa cell merge — giống logic ở /schedules
const DEPT_BS_ONLY = new Set(['CT', 'SAM'])              // chỉ BS
const DEPT_DD_ONLY = new Set(['XQUANG', 'LCK', 'YHCT'])  // chỉ ĐD
const DEPT_MERGED  = new Set(['HL', 'HL-CC', 'LX', 'VP'])// gộp 1 ô (1 người/ngày)

export default function PublicSchedulePage() {
  const params = useParams<{ year: string; month: string }>()
  const year = parseInt(params.year)
  const month = parseInt(params.month)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [didAutoJump, setDidAutoJump] = useState(false)

  useEffect(() => {
    setLoading(true)
    axios.get(`${API_URL}/public/schedules`, { params: { year, month } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Không tải được lịch trực'))
      .finally(() => setLoading(false))
  }, [year, month])

  // Auto-jump tới tuần chứa ngày hôm nay (nếu đang xem tháng hiện tại)
  useEffect(() => {
    if (didAutoJump) return
    const today = new Date()
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      const firstOfMonth = new Date(year, month - 1, 1)
      const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
      const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 })
      const diffMs = todayWeekStart.getTime() - baseWeek.getTime()
      const offset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
      setWeekOffset(Math.max(0, offset))
    }
    setDidAutoJump(true)
  }, [year, month, didAutoJump])

  const { weekStart, weekDays, maxWeekOffset } = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1)
    const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
    const ws = addWeeks(baseWeek, weekOffset)
    const wd = Array.from({length:7}, (_,i) => addDays(ws, i))
    const dim = getDaysInMonth(new Date(year, month - 1))
    return { weekStart: ws, weekDays: wd, maxWeekOffset: Math.ceil(dim / 7) + 1 }
  }, [year, month, weekOffset])

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [exporting, setExporting] = useState(false)

  // Xuất PNG tuần đang xem (1 ảnh A4 ngang lề 1.5cm)
  const handleExportImagePng = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const node = document.getElementById('public-export-area')
      if (!node) return
      const src = await html2canvas(node, {
        scale: 2, backgroundColor: '#ffffff',
        windowWidth: Math.max(node.scrollWidth, 1600),
        windowHeight: node.scrollHeight,
        ignoreElements: el => el.classList?.contains('no-export'),
      })
      // A4 ngang ở 200 DPI: 297×210mm
      const PX_PER_MM = 200 / 25.4
      const A4_W = Math.round(297 * PX_PER_MM)
      const A4_H = Math.round(210 * PX_PER_MM)
      const MARGIN = Math.round(15 * PX_PER_MM)
      const CW = A4_W - MARGIN * 2
      const CH = A4_H - MARGIN * 2
      const scale = Math.min(CW / src.width, CH / src.height)
      const drawW = src.width * scale
      const drawH = src.height * scale
      const out = document.createElement('canvas')
      out.width = A4_W; out.height = A4_H
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, A4_W, A4_H)
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(src, MARGIN + (CW - drawW) / 2, MARGIN + (CH - drawH) / 2, drawW, drawH)
      const a = document.createElement('a')
      a.href = out.toDataURL('image/png', 1.0)
      a.download = `lich-truc-tuan-${weekOffset + 1}-thang-${month}-${year}.png`
      a.click()
    } catch (err: any) {
      alert('Lỗi xuất ảnh: ' + (err?.message || err))
    } finally {
      setExporting(false)
    }
  }

  // Xuất PDF cả tháng (mỗi tuần 1 trang A4 ngang)
  const handleExportPdf = async () => {
    if (exporting) return
    setExporting(true)
    const savedOffset = weekOffset
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'), import('jspdf'),
      ])
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const PAGE_W = 297, PAGE_H = 210, MARGIN = 15
      const CW = PAGE_W - 2 * MARGIN, CH = PAGE_H - 2 * MARGIN
      const firstOfMonth = new Date(year, month - 1, 1)
      const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
      const lastDay = new Date(year, month, 0)
      const lastWeekStart = startOfWeek(lastDay, { weekStartsOn: 1 })
      const weeksTotal = Math.round((lastWeekStart.getTime() - baseWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1

      let pageAdded = 0
      for (let w = 0; w < weeksTotal; w++) {
        setWeekOffset(w)
        await new Promise(r => setTimeout(r, 250))
        const node = document.getElementById('public-export-area')
        if (!node) continue
        const canvas = await html2canvas(node, {
          scale: 2, backgroundColor: '#fff',
          windowWidth: Math.max(node.scrollWidth, 1600),
          windowHeight: node.scrollHeight,
          ignoreElements: el => el.classList?.contains('no-export'),
        })
        if (pageAdded > 0) pdf.addPage()
        pageAdded++
        const ratio = canvas.width / canvas.height
        let dW = CW, dH = dW / ratio
        if (dH > CH) { dH = CH; dW = dH * ratio }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
          MARGIN + (CW - dW) / 2, MARGIN + (CH - dH) / 2, dW, dH, undefined, 'FAST')
        pdf.setFontSize(8).setTextColor(120)
        pdf.text(`Tuần ${w + 1}/${weeksTotal} — Tháng ${month}/${year}`,
          PAGE_W / 2, PAGE_H - 6, { align: 'center' })
      }
      pdf.save(`lich-truc-thang-${month}-${year}.pdf`)
    } catch (err: any) {
      alert('Lỗi xuất PDF: ' + (err?.message || err))
    } finally {
      setWeekOffset(savedOffset)
      setExporting(false)
    }
  }

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
        || /tr[ưu]ởng\s*khoa|ph[óo]\s*tr[ưu]ởng\s*khoa|ph[óo]\s*khoa|gi[áa]m\s*đ[ốo]c/.test(t)
      ;(isBs ? m[d][dept].bs : m[d][dept].dd).push(s)
    }
    return m
  }, [data])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"/>
        <p className="text-gray-500 mt-3">Đang tải lịch trực...</p>
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <img src="/logo.png" alt="" className="h-16 w-16 mx-auto mb-3 opacity-70"/>
        <h1 className="text-lg font-bold text-gray-700">Không có dữ liệu lịch trực</h1>
        <p className="text-sm text-gray-500 mt-2">
          Lịch trực tháng {month}/{year} chưa được công bố. Vui lòng quay lại sau.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-[1720px] mx-auto px-2 py-3">
        <div id="public-export-area">
        {/* Header lớn rõ */}
        <div className="text-center mb-3 bg-white rounded-t-xl border border-b-0 border-gray-200 py-4 px-4">
          <img src="/logo.png" alt="" className="h-14 w-14 mx-auto mb-2 object-contain"/>
          <div className="text-sm uppercase text-gray-600 tracking-wide">SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG</div>
          <div className="text-base font-bold uppercase text-blue-900 mt-0.5">TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
          <h1 className="text-2xl md:text-3xl font-bold text-blue-900 mt-3 uppercase tracking-wide">
            Lịch Trực Toàn Viện
          </h1>
          <div className="text-lg font-semibold text-gray-700 mt-1">Tháng {month} năm {year}</div>
        </div>

        {/* Week navigation — to và rõ */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border-x border-gray-200 px-4 py-2.5 print:hidden no-export">
          <button onClick={()=>setWeekOffset(w=>Math.max(0,w-1))} disabled={weekOffset===0}
            className="text-gray-700 hover:text-blue-600 disabled:opacity-30 text-base font-bold px-3 py-1.5 rounded hover:bg-blue-50 transition-colors">
            ‹ Tuần trước
          </button>
          <span className="text-base font-bold text-gray-800">
            Từ <span className="text-blue-700">{format(weekStart,'dd/MM/yyyy')}</span> đến <span className="text-blue-700">{format(weekDays[6],'dd/MM/yyyy')}</span>
            <span className="ml-3 text-gray-400 text-sm font-medium">— Tuần {weekOffset+1}</span>
          </span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExportImagePng} disabled={exporting}
              className="bg-emerald-600 text-white text-sm px-3 py-1.5 rounded font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {exporting ? '⏳' : '🖼️'} Xuất ảnh tuần
            </button>
            <button onClick={handleExportPdf} disabled={exporting}
              className="bg-red-600 text-white text-sm px-3 py-1.5 rounded font-semibold hover:bg-red-700 disabled:opacity-50">
              {exporting ? '⏳' : '📄'} Xuất PDF cả tháng
            </button>
            <button onClick={()=>window.print()} className="text-sm text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded hover:bg-blue-50">🖨️ In</button>
            <button onClick={()=>setWeekOffset(w=>Math.min(maxWeekOffset,w+1))}
              className="text-gray-700 hover:text-blue-600 text-base font-bold px-3 py-1.5 rounded hover:bg-blue-50 transition-colors">
              Tuần sau ›
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-b-xl shadow-sm border border-t-0 border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm" style={{tableLayout:'fixed'}}>
            <thead>
              <tr className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 text-white shadow-md">
                <th rowSpan={2} className="sticky left-0 z-20 bg-gradient-to-br from-blue-800 to-blue-900 px-3 py-3 text-left font-bold uppercase tracking-wider border-r-2 border-blue-300/50 text-sm" style={{width:'180px'}}>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1 h-6 bg-yellow-300 rounded-sm"></span>
                    Thành phần trực
                  </div>
                </th>
                {weekDays.map(d => {
                  const dow = d.getDay()
                  const isSunday = dow === 0
                  const isSaturday = dow === 6
                  const dowLabel = isSunday ? 'CHỦ NHẬT' : isSaturday ? 'THỨ 7' : `THỨ ${dow + 1}`
                  const isToday = format(d,'yyyy-MM-dd') === todayStr
                  return (
                    <th key={d.getTime()} colSpan={2}
                      className={`px-2 py-2 text-center border-r border-blue-400/40 transition
                        ${isSunday ? 'bg-gradient-to-b from-rose-600 to-rose-700' : ''}
                        ${isSaturday ? 'bg-gradient-to-b from-orange-500 to-orange-600' : ''}
                        ${isToday ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}>
                      <div className="text-xs font-semibold opacity-90 tracking-wide">{dowLabel}</div>
                      <div className="text-lg font-bold leading-tight mt-0.5">{format(d,'dd/MM')}</div>
                      {isToday && <div className="text-[10px] font-bold text-yellow-200 mt-0.5">HÔM NAY</div>}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-blue-50 text-blue-900 text-xs border-t border-blue-200">
                {weekDays.flatMap(d => {
                  const dow = d.getDay()
                  const tone = dow === 0 ? 'bg-rose-50/70' : dow === 6 ? 'bg-orange-50/70' : 'bg-blue-50'
                  return [
                    <th key={`${d.getTime()}-bs`} className={`${tone} px-1 py-2 border-r border-blue-100 font-bold text-center uppercase tracking-wide text-[11px]`}>
                      <span className="text-blue-700">BS</span>
                    </th>,
                    <th key={`${d.getTime()}-dd`} className={`${tone} px-1 py-2 border-r border-blue-200 font-bold text-center uppercase tracking-wide text-[11px]`}>
                      <span className="text-emerald-700">ĐD/HS/KTV</span>
                    </th>,
                  ]
                })}
              </tr>
            </thead>
            <tbody>
              {data.departments.map((dept: any, ri: number) => {
                const isLanhDao = dept.code === 'LANHDAO'
                const rowBg = isLanhDao ? 'bg-amber-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                return (
                  <tr key={dept.id} className={`${rowBg} border-b border-gray-300 ${isLanhDao ? 'border-b-2 border-amber-300' : ''}`}>
                    <td className={`sticky left-0 z-10 ${rowBg} px-3 py-2 font-semibold border-r border-gray-300 text-sm uppercase tracking-wide ${isLanhDao ? 'text-amber-800' : 'text-blue-900'}`}>
                      <div className="flex items-center gap-1.5 leading-tight">
                        {isLanhDao && <span className="text-amber-600 text-base">★</span>}
                        <span className="break-words">{dept.name}</span>
                      </div>
                    </td>
                    {weekDays.flatMap(d => {
                      const dateStr = format(d,'yyyy-MM-dd')
                      const isWeekend = [0,6].includes(d.getDay())
                      const isToday = dateStr === todayStr
                      const cell = schedMap[dateStr]?.[dept.id] || { bs: [], dd: [] }

                      const renderItem = (s:any, type:'BS'|'DD') => {
                        const code = s.shiftType?.code || 'T'
                        const codeCls = SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-700 border-gray-300'
                        const tone = isLanhDao ? 'bg-amber-50 border border-amber-300'
                          : type==='BS' ? 'bg-blue-50 border border-blue-200'
                          : 'bg-green-50 border border-green-200'
                        return (
                          <div key={s.id} className={`rounded-md px-1.5 py-1 ${tone}`}>
                            <div className="flex items-start gap-1.5 text-[13px]">
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border shrink-0 mt-0.5 ${codeCls}`}>{code}</span>
                              <span className="flex-1 leading-tight font-semibold text-gray-800 break-words">
                                {s.user?.fullName}
                              </span>
                            </div>
                            {isLanhDao && s.user?.phone && (
                              <div className="text-[11px] text-amber-700 font-mono ml-6 mt-0.5">📞 {s.user.phone}</div>
                            )}
                          </div>
                        )
                      }

                      const cellCls = `align-top border border-gray-300 px-1.5 py-1.5
                        ${isWeekend ? 'bg-orange-50/40' : ''}
                        ${isToday ? 'bg-yellow-50/60' : ''}`

                      // LÃNH ĐẠO: gộp 2 cột
                      if (isLanhDao) {
                        const all = [...cell.bs, ...cell.dd]
                        return [(
                          <td key={`${dateStr}-${dept.id}-LD`} colSpan={2} className={cellCls + ' border border-amber-300'}>
                            <div className="space-y-1 min-h-[60px]">
                              {all.map(s => renderItem(s, 'BS'))}
                            </div>
                          </td>
                        )]
                      }

                      // Khoa chỉ 1 loại nhân sự / merge — colSpan 2
                      if (DEPT_MERGED.has(dept.code) || DEPT_BS_ONLY.has(dept.code) || DEPT_DD_ONLY.has(dept.code)) {
                        const all = [...cell.bs, ...cell.dd]
                        const rowType: 'BS'|'DD' = DEPT_DD_ONLY.has(dept.code) ? 'DD' : 'BS'
                        return [(
                          <td key={`${dateStr}-${dept.id}-merged`} colSpan={2} className={cellCls}>
                            <div className="space-y-1 min-h-[60px]">
                              {all.map(s => renderItem(s, rowType))}
                            </div>
                          </td>
                        )]
                      }

                      const renderCell = (items:any[], type:'BS'|'DD') => (
                        <td key={`${dateStr}-${dept.id}-${type}`} className={cellCls}>
                          <div className="space-y-1 min-h-[60px]">
                            {items.map(s => renderItem(s, type))}
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

        </div>{/* /public-export-area */}

        {/* Legend */}
        <div className="flex gap-5 mt-3 text-sm text-gray-600 flex-wrap items-center print:hidden">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-blue-100 border border-blue-200 rounded inline-block"/>Bác sĩ (BS)</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-green-100 border border-green-200 rounded inline-block"/>Điều dưỡng/Hộ sinh/KTV</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-amber-100 border border-amber-300 rounded inline-block"/>Lãnh đạo</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-orange-50 border border-orange-200 rounded inline-block"/>Cuối tuần</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-yellow-50 border-2 border-yellow-400 rounded inline-block"/>Hôm nay</span>
        </div>

        <div className="text-center text-xs text-gray-400 mt-4 italic print:mt-2">
          Phòng Kế hoạch - Nghiệp vụ — TTYT KV Liên Chiểu
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
