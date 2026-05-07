'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, userApi, departmentApi, scheduleExtraApi, swapApi } from '@/lib/api'
import { format, startOfWeek, addDays, addWeeks, getDaysInMonth } from 'date-fns'
import { vi } from 'date-fns/locale'

const DUTY_ORDER = [
  'LANHDAO','CC-HSTC','HL-CC','CC-NGOAI','NGOAI','GMHS','CC-SAN','SAN','NOI','NHI','YHCT','LCK','SAM','CT','XQUANG','XN','VP','LX','HL'
]

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

export default function SchedulesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedules, setSchedules] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{deptId:string, date:string}|null>(null)
  const [form, setForm] = useState({ userId:'', departmentId:'', shiftTypeId:'', shiftDate:'', note:'' })
  const [viewMode, setViewMode] = useState<'week'|'month'>('week')
  const [lockedDepts, setLockedDepts] = useState<Set<string>>(new Set())
  const [showSwapModal, setShowSwapModal] = useState(false)
  const [swapTarget, setSwapTarget] = useState<any>(null)
  const [swapForm, setSwapForm] = useState({ targetUserId:'', reason:'', pdfBase64:'', pdfFilename:'' })
  const [swapMode, setSwapMode] = useState<'form'|'pdf'>('form')

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    setUser(JSON.parse(u))
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, lockData] = await Promise.all([
        scheduleApi.list({ year, month }),
        departmentApi.list(),
        scheduleExtraApi.lockStatus({ year, month }).catch(()=>[]),
      ])
      setSchedules(s)
      const sorted = [...d].sort((a,b) => {
        const ai = DUTY_ORDER.indexOf(a.code)
        const bi = DUTY_ORDER.indexOf(b.code)
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
      setDepartments(sorted)
      const locked = new Set<string>()
      ;(lockData||[]).forEach((row:any) => locked.add(row.departmentId))
      setLockedDepts(locked)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }, [year, month, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!user) return
    userApi.list().then(setUsers).catch(()=>{})
  }, [user])

  // Memoize derived values — these were re-computed on every render before
  // Multi-dept aware: include user if any of their departmentIds matches.
  const filteredUsersForForm = useMemo(() => {
    if (!form.departmentId) return users
    return users.filter((u: any) => {
      if (u.departmentIds && u.departmentIds.length > 0) return u.departmentIds.includes(form.departmentId)
      return u.departmentId === form.departmentId
    })
  }, [users, form.departmentId])

  // Khoa được phép cho dept_lead
  const allowedDeptIds = useMemo(() => {
    if (user?.role !== 'department_lead') return null
    const ids: string[] = (user as any)?.departmentIds || (user?.departmentId ? [user.departmentId] : [])
    return new Set(ids.length > 0 ? ids : [user?.departmentId].filter(Boolean) as string[])
  }, [user])

  const visibleDepartments = useMemo(() => {
    if (!allowedDeptIds) return departments
    return departments.filter(d => allowedDeptIds.has(d.id))
  }, [departments, allowedDeptIds])

  const { weekStart, weekDays, daysInMonth, maxWeekOffset } = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1)
    const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
    const ws = addWeeks(baseWeek, weekOffset)
    const wd = Array.from({length:7}, (_,i) => addDays(ws, i))
    const dim = getDaysInMonth(new Date(year, month - 1))
    return { weekStart: ws, weekDays: wd, daysInMonth: dim, maxWeekOffset: Math.ceil(dim / 7) + 1 }
  }, [year, month, weekOffset])

  // Group schedules by date+dept and pre-split BS/DD — heavy work, memoized
  const schedMap = useMemo(() => {
    const m: Record<string, Record<string, { bs: any[]; dd: any[] }>> = {}
    for (const s of schedules) {
      const d = format(new Date(s.shiftDate), 'yyyy-MM-dd')
      const dept = s.departmentId
      if (!m[d]) m[d] = {}
      if (!m[d][dept]) m[d][dept] = { bs: [], dd: [] }
      const isBs = s.user?.title === 'Bác sĩ' || s.user?.title?.toLowerCase().includes('bác sĩ') || s.user?.title?.toLowerCase().includes('lãnh đạo')
      ;(isBs ? m[d][dept].bs : m[d][dept].dd).push(s)
    }
    return m
  }, [schedules])

  const openAddForm = (deptId: string, date: string) => {
    setSelectedCell({deptId, date})
    setForm({userId:'', departmentId:deptId, shiftTypeId:'', shiftDate:date, note:''})
    setShowForm(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await scheduleApi.create(form)
      setShowForm(false)
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi tạo lịch') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa ca trực này?')) return
    await scheduleApi.delete(id)
    load()
  }

  const handleApprove = async (id: string) => {
    await scheduleApi.approve(id)
    load()
  }

  const handleSubmitMonth = async () => {
    if (!confirm(`Nộp lịch tháng ${month}/${year} cho admin? Sau khi nộp, không thể chỉnh sửa.`)) return
    try {
      const r = await scheduleApi.submitMonth(year, month)
      alert(`Đã nộp ${r.submitted} ca trực`)
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleLockMonth = async () => {
    if (!confirm(`Khoá toàn bộ lịch tháng ${month}/${year}? Sau khi khoá: lịch sẽ hiển thị trên link công khai. Có thể mở khoá lại sau.`)) return
    try {
      const r = await scheduleExtraApi.approveMonth(year, month)
      alert(`Đã khoá ${r.approved} ca trực — link công khai đã sẵn sàng.`)
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleUnlockMonth = async () => {
    if (!confirm(`Mở khoá lịch tháng ${month}/${year}? Link công khai sẽ trống cho tới khi khoá lại.`)) return
    try {
      const r = await scheduleExtraApi.unlockMonth(year, month)
      alert(`Đã mở khoá ${r.unlocked} ca trực`)
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/public/lich-truc/${year}/${month}`
    try { await navigator.clipboard.writeText(url); alert(`✓ Đã copy: ${url}`) }
    catch { prompt('Copy link công khai:', url) }
  }

  const handleExportImage = async () => {
    const html2canvas = (await import('html2canvas')).default
    const node = document.getElementById('schedule-table-container')
    if (!node) return
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `lich-truc-thang-${month}-${year}.png`
    a.click()
  }

  // Tháng đã khoá hay chưa? (mọi schedule đều status='approved')
  const monthIsApproved = useMemo(() => {
    if (schedules.length === 0) return false
    return schedules.every(s => s.status === 'approved')
  }, [schedules])

  const handleDuplicate = async () => {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    if (!confirm(`Sao chép lịch từ tháng ${prevMonth}/${prevYear} sang tháng ${month}/${year}?`)) return
    try {
      const r = await scheduleExtraApi.duplicateFrom({ fromYear: prevYear, fromMonth: prevMonth, toYear: year, toMonth: month })
      alert(`Đã tạo ${r.created}/${r.total} ca trực (bỏ qua ${r.skipped} ca trùng)`)
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const openSwapModal = (s: any) => {
    setSwapTarget(s)
    setSwapForm({ targetUserId:'', reason:'', pdfBase64:'', pdfFilename:'' })
    setSwapMode('form')
    setShowSwapModal(true)
  }

  const handlePdfPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') { alert('Chỉ chấp nhận file PDF'); return }
    if (f.size > 5 * 1024 * 1024) { alert('File PDF tối đa 5MB'); return }
    const reader = new FileReader()
    reader.onload = () => {
      setSwapForm(p => ({ ...p, pdfBase64: reader.result as string, pdfFilename: f.name }))
    }
    reader.readAsDataURL(f)
  }

  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload: any = {
        scheduleId: swapTarget.id,
        targetUserId: swapForm.targetUserId,
        reason: swapForm.reason,
      }
      if (swapMode === 'pdf' && swapForm.pdfBase64) {
        payload.signedFormPdf = swapForm.pdfBase64
        payload.signedFormFilename = swapForm.pdfFilename
      }
      await swapApi.create(payload)
      setShowSwapModal(false)
      alert('Đã gửi yêu cầu đổi trực — chờ admin duyệt')
      load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const isAdmin = user?.role === 'admin'
  const isDeptLead = user?.role === 'department_lead'
  const canEdit = isAdmin || isDeptLead

  // Month view: calendar grid
  const days = Array.from({length: daysInMonth}, (_,i) => i+1)
  const grouped: Record<number, any[]> = {}
  schedules.forEach(s => {
    const day = new Date(s.shiftDate).getDate()
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(s)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-[1400px] mx-auto px-3 py-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-lg font-bold text-gray-800">Lịch Trực Toàn Viện</h1>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select value={month} onChange={e=>{setMonth(+e.target.value);setWeekOffset(0)}}
              className="border rounded-lg px-2 py-1 text-sm">
              {Array.from({length:12},(_,i)=>i+1).map(m=>(
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select value={year} onChange={e=>{setYear(+e.target.value);setWeekOffset(0)}}
              className="border rounded-lg px-2 py-1 text-sm">
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button onClick={()=>setViewMode('week')} className={`px-3 py-1 ${viewMode==='week'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50'}`}>Tuần</button>
              <button onClick={()=>setViewMode('month')} className={`px-3 py-1 ${viewMode==='month'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50'}`}>Tháng</button>
            </div>
            {canEdit && (
              <>
                <button onClick={handleDuplicate}
                  className="bg-purple-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-purple-700"
                  title="Sao chép lịch tháng trước">
                  ⎘ Tự tạo từ tháng trước
                </button>
                {isDeptLead && (
                  <button onClick={handleSubmitMonth}
                    className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-green-700">
                    📤 Nộp lịch tháng
                  </button>
                )}
                {isAdmin && !monthIsApproved && schedules.length > 0 && (
                  <button onClick={handleLockMonth} title="Khoá tháng & bật link công khai"
                    className="bg-amber-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-amber-700">
                    🔒 Khoá tháng
                  </button>
                )}
                {isAdmin && monthIsApproved && (
                  <button onClick={handleUnlockMonth} title="Mở khoá để chỉnh sửa lại"
                    className="border border-amber-400 text-amber-700 px-3 py-1 rounded-lg text-sm font-medium hover:bg-amber-50">
                    🔓 Mở khoá
                  </button>
                )}
                <button onClick={copyPublicLink} title="Sao chép link xem công khai (chỉ hiện sau khi khoá)"
                  className="border border-blue-400 text-blue-700 px-3 py-1 rounded-lg text-sm hover:bg-blue-50">
                  🔗 Link công khai
                </button>
                <button onClick={handleExportImage} title="Xuất ảnh PNG chất lượng cao"
                  className="border border-gray-400 text-gray-700 px-3 py-1 rounded-lg text-sm hover:bg-gray-50">
                  🖼️ Xuất ảnh
                </button>
                <button onClick={()=>{setSelectedCell(null);setForm({userId:'',departmentId:isDeptLead && allowedDeptIds ? Array.from(allowedDeptIds)[0] || '' : '',shiftTypeId:'',shiftDate:'',note:''});setShowForm(true)}}
                  className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-blue-700">
                  + Thêm ca trực
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : viewMode === 'week' ? (
          /* WEEKLY VIEW */
          <div>
            {/* Excel-style title */}
            <div className="text-center bg-white rounded-t-xl border border-b-0 border-gray-200 py-3 px-4">
              <h2 className="text-base font-bold text-blue-900 uppercase tracking-wide">
                LỊCH TRỰC TOÀN VIỆN THÁNG {month}/{year}
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                Từ ngày {format(weekStart,'dd/MM/yyyy')} đến ngày {format(weekDays[6],'dd/MM/yyyy')}
                <span className="ml-3 text-gray-400">— Tuần {weekOffset+1}</span>
              </p>
            </div>
            {/* Week navigation */}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-1.5 border-x border-gray-200">
              <button onClick={()=>setWeekOffset(w=>Math.max(0,w-1))} disabled={weekOffset===0}
                className="text-gray-600 hover:text-blue-600 disabled:opacity-30 text-base font-bold px-2">‹ Tuần trước</button>
              <button onClick={()=>window.print()} className="text-xs text-gray-500 hover:text-blue-600">🖨️ In tuần này</button>
              <button onClick={()=>setWeekOffset(w=>Math.min(maxWeekOffset,w+1))}
                className="text-gray-600 hover:text-blue-600 text-base font-bold px-2">Tuần sau ›</button>
            </div>

            <div id="schedule-table-container" className="overflow-x-auto rounded-b-xl shadow-sm border border-t-0 border-gray-200">
              <table className="min-w-full border-collapse text-xs bg-white">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 text-white shadow-md">
                    <th rowSpan={2} className="sticky left-0 z-20 bg-gradient-to-br from-blue-800 to-blue-900 px-4 py-3 text-left font-bold uppercase tracking-wider border-r-2 border-blue-300/50 min-w-[160px] text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1 h-6 bg-yellow-300 rounded-sm"></span>
                        Thành phần trực
                      </div>
                    </th>
                    {weekDays.map(d => {
                      const inMonth = d.getMonth() === month-1 && d.getFullYear() === year
                      const dow = d.getDay()
                      const isSunday = dow === 0
                      const isSaturday = dow === 6
                      const dowLabel = isSunday ? 'CHỦ NHẬT' : isSaturday ? 'THỨ 7' : `THỨ ${dow + 1}`
                      return (
                        <th key={d.getTime()} colSpan={2}
                          className={`px-2 py-2 text-center border-r border-blue-400/40 min-w-[130px] transition
                            ${!inMonth ? 'opacity-40' : ''}
                            ${isSunday ? 'bg-gradient-to-b from-rose-600 to-rose-700' : ''}
                            ${isSaturday ? 'bg-gradient-to-b from-orange-500 to-orange-600' : ''}`}>
                          <div className="text-[10px] font-medium opacity-80 tracking-wide">{dowLabel}</div>
                          <div className="text-[15px] font-bold leading-none mt-0.5">{format(d,'dd/MM')}</div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-blue-50 text-blue-900 text-[10px] border-t border-blue-200">
                    {weekDays.flatMap(d => {
                      const dow = d.getDay()
                      const tone = dow === 0 ? 'bg-rose-50/70' : dow === 6 ? 'bg-orange-50/70' : 'bg-blue-50'
                      return [
                        <th key={`${d.getTime()}-bs`} className={`${tone} px-1 py-1.5 border-r border-blue-100 font-bold text-center w-[65px] uppercase tracking-wide`}>
                          <span className="text-blue-700">BS</span>
                        </th>,
                        <th key={`${d.getTime()}-dd`} className={`${tone} px-1 py-1.5 border-r border-blue-200 font-bold text-center w-[65px] uppercase tracking-wide`}>
                          <span className="text-emerald-700">ĐD/HS/KTV</span>
                        </th>,
                      ]
                    })}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept, ri) => {
                    const isLanhDao = dept.code === 'LANHDAO'
                    const rowBg = isLanhDao ? 'bg-amber-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    return (
                      <tr key={dept.id} className={`${rowBg} border-b border-gray-300 hover:bg-blue-50/30 ${isLanhDao ? 'border-b-2 border-amber-300' : ''}`}>
                        <td className={`sticky left-0 z-10 ${rowBg} px-3 py-2 font-semibold border-r border-gray-300 text-[11px] uppercase tracking-wide ${isLanhDao ? 'text-amber-800' : 'text-blue-900'}`}>
                          <div className="flex items-center gap-1">
                            {isLanhDao && <span className="text-amber-600">★</span>}
                            <span>{dept.name}</span>
                            {lockedDepts.has(dept.id) && (
                              <span className="text-amber-600" title="Đã nộp/duyệt — chỉ admin sửa được">🔒</span>
                            )}
                          </div>
                        </td>
                        {weekDays.flatMap(d => {
                          const dateStr = format(d,'yyyy-MM-dd')
                          const inMonth = d.getMonth() === month-1 && d.getFullYear() === year
                          const isWeekend = [0,6].includes(d.getDay())
                          const cell = schedMap[dateStr]?.[dept.id] || { bs: [], dd: [] }
                          const renderCell = (items: any[], type: 'BS'|'DD') => (
                            <td key={`${dateStr}-${dept.id}-${type}`}
                              className={`align-top border border-gray-300 px-1 py-1 ${!inMonth?'bg-gray-100 opacity-30':''}  ${isWeekend?'bg-orange-50/40':''}`}>
                              <div className="space-y-1 min-h-[44px]">
                                {items.map(s=>{
                                  const code = s.shiftType?.code || 'T'
                                  const codeCls = SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-700 border-gray-300'
                                  const isLD = dept.code === 'LANHDAO'
                                  const tone = isLD ? 'bg-amber-50 border border-amber-300' : type==='BS' ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'
                                  return (
                                    <div key={s.id} className={`group rounded px-1 py-0.5 ${tone}`}>
                                      <div className="flex items-center gap-1 text-[10px]">
                                        <span className={`px-1 rounded text-[9px] font-bold border shrink-0 ${codeCls}`} title={`Mã ca: ${code}`}>{code}</span>
                                        <span className="flex-1 leading-tight font-medium truncate" title={s.user?.fullName}>
                                          {s.user?.fullName}
                                        </span>
                                        <div className="hidden group-hover:flex gap-0.5 shrink-0">
                                          {canEdit && s.status==='draft' && isAdmin && (
                                            <button onClick={()=>handleApprove(s.id)} className="text-green-600 hover:text-green-800" title="Duyệt">✓</button>
                                          )}
                                          {!canEdit && s.userId === user?.id && (
                                            <button onClick={()=>openSwapModal(s)} className="text-orange-500 hover:text-orange-700" title="Báo đổi trực">⇄</button>
                                          )}
                                          {canEdit && <button onClick={()=>handleDelete(s.id)} className="text-red-400 hover:text-red-600" title="Xoá">✕</button>}
                                        </div>
                                      </div>
                                      {dept.code === 'LANHDAO' && s.user?.phone && (
                                        <div className="text-[9px] text-amber-700 font-mono ml-5 mt-0.5">📞 {s.user.phone}</div>
                                      )}
                                    </div>
                                  )
                                })}
                                {canEdit && inMonth && (
                                  <button onClick={()=>openAddForm(dept.id, dateStr)}
                                    className="w-full text-gray-300 hover:text-blue-500 text-center leading-none opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity text-base">
                                    +
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                          return [renderCell(cell.bs, 'BS'), renderCell(cell.dd, 'DD')]
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 rounded inline-block"/>Bác sĩ (BS)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 rounded inline-block"/>Điều dưỡng/Hộ sinh/KTV</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-50 border border-orange-200 rounded inline-block"/>Cuối tuần</span>
            </div>
          </div>
        ) : (
          /* MONTHLY CALENDAR VIEW */
          <div>
            <div className="grid grid-cols-7 gap-1.5">
              {['CN','T2','T3','T4','T5','T6','T7'].map(d=>(
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
              ))}
              {Array.from({length: new Date(year,month-1,1).getDay()}).map((_,i)=>(
                <div key={`e${i}`}/>
              ))}
              {days.map(day => {
                const date = new Date(year, month-1, day)
                const isWeekend = [0,6].includes(date.getDay())
                const daySchedules = grouped[day] || []
                return (
                  <div key={day} className={`min-h-20 border rounded-lg p-1.5 ${isWeekend?'bg-orange-50 border-orange-200':'bg-white border-gray-200'}`}>
                    <div className={`text-xs font-semibold mb-1 ${isWeekend?'text-orange-600':'text-gray-600'}`}>{day}</div>
                    <div className="space-y-0.5">
                      {daySchedules.map(s=>(
                        <div key={s.id} className="bg-blue-100 text-blue-800 text-[10px] rounded px-1 py-0.5 flex items-center justify-between group">
                          <span className="truncate">{s.user?.fullName?.split(' ').pop()}</span>
                          <div className="hidden group-hover:flex gap-0.5">
                            {s.status==='draft' && isAdmin && (
                              <button onClick={()=>handleApprove(s.id)} className="text-green-600">✓</button>
                            )}
                            {canEdit && <button onClick={()=>handleDelete(s.id)} className="text-red-500">✕</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Biểu mẫu báo đổi trực */}
      {showSwapModal && swapTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-auto mx-4">
            {/* Tabs: form vs PDF */}
            <div className="flex border-b">
              <button onClick={()=>setSwapMode('form')}
                className={`flex-1 py-3 text-sm font-medium ${swapMode==='form' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>
                ✍️ Nhập đơn trên hệ thống
              </button>
              <button onClick={()=>setSwapMode('pdf')}
                className={`flex-1 py-3 text-sm font-medium ${swapMode==='pdf' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>
                📎 Tải đơn PDF đã ký
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-2 gap-2 px-6 pt-5 pb-3 border-b text-[10px]">
              <div className="text-center uppercase">
                <div>SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG</div>
                <div className="font-bold">TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
                <div className="w-20 mx-auto mt-1 border-t border-black"></div>
              </div>
              <div className="text-center uppercase">
                <div className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                <div className="normal-case">Độc lập – Tự do – Hạnh phúc</div>
                <div className="w-28 mx-auto mt-1 border-t border-black"></div>
              </div>
            </div>
            <div className="text-right text-xs italic px-6 pt-2 text-gray-600">
              Hòa Khánh, ngày {format(new Date(),'dd')} tháng {format(new Date(),'MM')} năm {format(new Date(),'yyyy')}
            </div>
            <h2 className="text-center text-lg font-bold uppercase mt-2 pb-3 border-b">Đơn xin đổi lịch trực bệnh viện</h2>
            <form onSubmit={handleSwapSubmit} className="px-8 py-5 space-y-4 text-sm">
              <p className="italic">
                Kính gửi: <br/>
                <span className="ml-3">— <b>Ban Giám đốc</b> Trung tâm Y tế khu vực Liên Chiểu</span><br/>
                <span className="ml-3">— <b>Phòng Kế hoạch – Nghiệp vụ</b></span>
              </p>

              {swapMode === 'form' ? (
                <>
                  <div className="space-y-2">
                    <p>Tên tôi là: <b>{user?.fullName}</b> &nbsp;&nbsp;
                      Chức danh/Chức vụ: <b>{user?.title || '—'}</b></p>
                    <p>Khoa/phòng: <b>{user?.department?.name || '—'}</b></p>
                  </div>

                  <div className="font-semibold text-gray-700 pt-2">Nội dung sự việc trình bày:</div>
                  <div>
                    <label className="block text-gray-700 mb-1">— Lý do <span className="text-red-500">*</span></label>
                    <textarea value={swapForm.reason} onChange={e=>setSwapForm({...swapForm,reason:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}
                      placeholder="VD: Đi công tác, hiếu hỉ gia đình..." required/>
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1">— Người nhận đổi ca <span className="text-red-500">*</span></label>
                    <select value={swapForm.targetUserId} onChange={e=>setSwapForm({...swapForm,targetUserId:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm" required>
                      <option value="">— Chọn người trực thay (cùng khoa) —</option>
                      {users.filter(u=>u.id!==swapTarget.userId&&u.departmentId===swapTarget.departmentId).map(u=>(
                        <option key={u.id} value={u.id}>{u.fullName} {u.title?`— ${u.title}`:''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bảng thông tin ca trực giống mẫu */}
                  <p className="italic text-gray-700">
                    Tôi làm đơn này kính mong Ban Giám đốc, phòng KHNV tạo điều kiện, chấp thuận
                    cho tôi đổi ca trực, cụ thể như sau:
                  </p>
                  <table className="w-full text-xs border-collapse border border-gray-400">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 px-2 py-1 font-semibold">Họ và tên</th>
                        <th className="border border-gray-400 px-2 py-1 font-semibold">Ngày trực được phân</th>
                        <th className="border border-gray-400 px-2 py-1 font-semibold">Người nhận đổi ca</th>
                        <th className="border border-gray-400 px-2 py-1 font-semibold">Trực chuyên môn</th>
                        <th className="border border-gray-400 px-2 py-1 font-semibold">Trực lãnh đạo<br/>(nếu có)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-400 px-2 py-2 text-center">{user?.fullName}</td>
                        <td className="border border-gray-400 px-2 py-2 text-center">{format(new Date(swapTarget.shiftDate),'dd/MM/yyyy')}</td>
                        <td className="border border-gray-400 px-2 py-2 text-center">
                          {users.find(u=>u.id===swapForm.targetUserId)?.fullName || '...'}
                        </td>
                        <td className="border border-gray-400 px-2 py-2 text-center">
                          {swapTarget.department?.code === 'LANHDAO' ? '—' : `${swapTarget.department?.name} (${swapTarget.shiftType?.code})`}
                        </td>
                        <td className="border border-gray-400 px-2 py-2 text-center">
                          {swapTarget.department?.code === 'LANHDAO' ? `Lãnh đạo (${swapTarget.shiftType?.code})` : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <p>Tên tôi là: <b>{user?.fullName}</b></p>
                    <p>Khoa/phòng: <b>{user?.department?.name || '—'}</b></p>
                    <p>Tôi xin đổi ca trực ngày <b>{format(new Date(swapTarget.shiftDate),'dd/MM/yyyy')}</b> tại <b>{swapTarget.department?.name}</b>.</p>
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1">Người nhận đổi ca <span className="text-red-500">*</span></label>
                    <select value={swapForm.targetUserId} onChange={e=>setSwapForm({...swapForm,targetUserId:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm" required>
                      <option value="">— Chọn người trực thay —</option>
                      {users.filter(u=>u.id!==swapTarget.userId&&u.departmentId===swapTarget.departmentId).map(u=>(
                        <option key={u.id} value={u.id}>{u.fullName} {u.title?`— ${u.title}`:''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-4">
                    <label className="block text-blue-800 font-semibold mb-2">📎 File đơn PDF đã có chữ ký <span className="text-red-500">*</span></label>
                    <input type="file" accept="application/pdf" onChange={handlePdfPick}
                      className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"/>
                    {swapForm.pdfFilename && (
                      <div className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                        ✓ Đã chọn: <b>{swapForm.pdfFilename}</b> ({Math.round(swapForm.pdfBase64.length / 1024)} KB)
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-2">
                      File PDF tối đa 5MB, đã có đầy đủ chữ ký Người viết đơn / Người đổi ca / Trưởng khoa.
                      Sau khi gửi, admin (P. KH-NV) sẽ duyệt.
                    </p>
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1">Ghi chú thêm</label>
                    <input value={swapForm.reason} onChange={e=>setSwapForm({...swapForm,reason:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="(Tùy chọn)"/>
                  </div>
                </>
              )}

              <div className="text-xs text-gray-700 italic">
                Tôi cam kết sẽ thực hiện nghiêm chỉnh những gì đã nêu trong đơn và chịu hoàn toàn trách nhiệm
                về việc xảy ra liên quan.<br/>
                Tôi xin chân thành cảm ơn!
              </div>

              {/* Khu vực ký xác nhận theo mẫu .docx */}
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 text-[10px] divide-x divide-y md:divide-y-0">
                  <div className="p-3 text-center">
                    <div className="font-bold uppercase text-gray-700">Người viết đơn</div>
                    <div className="italic text-gray-400 text-[9px]">(Ký, ghi rõ họ tên)</div>
                    <div className="h-12"></div>
                    <div className="text-gray-700 font-medium">{user?.fullName}</div>
                  </div>
                  <div className="p-3 text-center">
                    <div className="font-bold uppercase text-gray-700">Người đổi ca</div>
                    <div className="italic text-gray-400 text-[9px]">(Ký, ghi rõ họ tên)</div>
                    <div className="h-12"></div>
                    <div className="text-gray-700 font-medium">
                      {users.find(u=>u.id===swapForm.targetUserId)?.fullName || '...'}
                    </div>
                  </div>
                  <div className="p-3 text-center">
                    <div className="font-bold uppercase text-gray-700">Trưởng khoa</div>
                    <div className="italic text-gray-400 text-[9px]">(Ký, ghi rõ họ tên)</div>
                    <div className="h-12"></div>
                  </div>
                  <div className="p-3 text-center">
                    <div className="font-bold uppercase text-gray-700">P.KHNV</div>
                    <div className="italic text-gray-400 text-[9px]">(Ký, ghi rõ họ tên)</div>
                    <div className="h-12"></div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t print:hidden">
                <button type="button" onClick={()=>setShowSwapModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Huỷ</button>
                <button type="button" onClick={()=>window.print()}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                  🖨️ In đơn
                </button>
                <button type="submit"
                  className="flex-1 bg-orange-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-700">
                  📤 Gửi đơn đề nghị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal thêm ca trực */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">Thêm ca trực</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Nhân viên</label>
                <select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required>
                  <option value="">Chọn nhân viên</option>
                  {filteredUsersForForm.length === 0 && form.departmentId && (
                    <option value="" disabled>Khoa này chưa có nhân viên</option>
                  )}
                  {filteredUsersForForm.map(u=><option key={u.id} value={u.id}>{u.fullName} {u.title?`(${u.title})`:''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Khoa/Phòng trực</label>
                <select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required
                  disabled={!!allowedDeptIds && allowedDeptIds.size === 1}>
                  <option value="">Chọn khoa/phòng</option>
                  {(allowedDeptIds ? departments.filter(d=>allowedDeptIds.has(d.id)) : departments)
                    .map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {allowedDeptIds && allowedDeptIds.size === 1 && (
                  <p className="text-[10px] text-gray-400 mt-1 italic">Bạn chỉ được nhập lịch cho khoa đã phân quyền.</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ngày trực</label>
                <input type="date" value={form.shiftDate} onChange={e=>setForm({...form,shiftDate:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
              </div>
              <p className="text-xs text-gray-500 italic">
                💡 Mã ca trực sẽ tự động xác định theo (khoa + ngày): T/C/L cho ca thường,
                TC/CC/LC cho cấp cứu, THS/CHS/LHS cho hồi sức.
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <input type="text" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" placeholder="Tùy chọn"/>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Hủy</button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
