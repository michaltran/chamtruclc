'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, userApi, departmentApi, scheduleExtraApi, swapApi } from '@/lib/api'
import { format, startOfWeek, addDays, addWeeks, subWeeks, getDaysInMonth, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'

const DUTY_ORDER = [
  'CC-HSTC','HL-CC','CC-NGOAI','NGOAI','GMHS','CC-SAN','SAN','NOI','NHI','YHCT','LCK','SAM','CT','XQUANG','XN','VP','LX','HL'
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
  const [shiftTypes, setShiftTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{deptId:string, date:string}|null>(null)
  const [form, setForm] = useState({ userId:'', departmentId:'', shiftTypeId:'', shiftDate:'', note:'' })
  const [viewMode, setViewMode] = useState<'week'|'month'>('week')
  const [lockedDepts, setLockedDepts] = useState<Set<string>>(new Set())
  const [showSwapModal, setShowSwapModal] = useState(false)
  const [swapTarget, setSwapTarget] = useState<any>(null)
  const [swapForm, setSwapForm] = useState({ targetUserId:'', reason:'' })

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
    // Load all users (admin) or department users (dept_lead) — backend already filters
    userApi.list().then(setUsers).catch(()=>{})
    scheduleApi.shiftTypes().then(setShiftTypes).catch(()=>{})
  }, [user])

  // Filter staff dropdown by selected duty department: only show users in that dept
  const filteredUsersForForm = form.departmentId
    ? users.filter(u => u.departmentId === form.departmentId)
    : users

  // Week days: Mon-Sun of the selected week offset within month
  const firstOfMonth = new Date(year, month - 1, 1)
  const baseWeek = startOfWeek(firstOfMonth, { weekStartsOn: 1 })
  const weekStart = addWeeks(baseWeek, weekOffset)
  const weekDays = Array.from({length:7}, (_,i) => addDays(weekStart, i))

  // Filter days that belong to the current month
  const daysInMonth = getDaysInMonth(new Date(year, month - 1))

  // Group schedules by date+dept
  type SchedMap = Record<string, Record<string, any[]>>
  const schedMap: SchedMap = {}
  schedules.forEach(s => {
    const d = format(new Date(s.shiftDate), 'yyyy-MM-dd')
    const dept = s.departmentId
    if (!schedMap[d]) schedMap[d] = {}
    if (!schedMap[d][dept]) schedMap[d][dept] = []
    schedMap[d][dept].push(s)
  })

  const maxWeekOffset = Math.ceil(daysInMonth / 7) + 1

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
    setSwapForm({ targetUserId:'', reason:'' })
    setShowSwapModal(true)
  }

  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await swapApi.create({ scheduleId: swapTarget.id, ...swapForm })
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
                <button onClick={()=>{setSelectedCell(null);setForm({userId:'',departmentId:'',shiftTypeId:'',shiftDate:'',note:''});setShowForm(true)}}
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

            <div className="overflow-x-auto rounded-b-xl shadow-sm border border-t-0 border-gray-200">
              <table className="min-w-full border-collapse text-xs bg-white">
                <thead>
                  <tr className="bg-blue-700 text-white">
                    <th className="sticky left-0 z-10 bg-blue-700 px-3 py-2 text-left font-semibold border-r border-blue-600 min-w-[140px]">
                      THÀNH PHẦN TRỰC
                    </th>
                    {weekDays.map(d => {
                      const dayNum = d.getDate()
                      const inMonth = d.getMonth() === month-1 && d.getFullYear() === year
                      const isWeekend = [0,6].includes(d.getDay())
                      return (
                        <th key={dayNum} colSpan={2}
                          className={`px-2 py-2 text-center border-r border-blue-600 min-w-[130px] ${!inMonth?'opacity-30':''} ${isWeekend?'bg-orange-600':''}`}>
                          <div className="font-bold">{format(d,'EEE',{locale:vi}).toUpperCase()}</div>
                          <div className="text-xs opacity-90">{format(d,'dd/MM')}</div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-blue-100 text-blue-800 text-[10px]">
                    <th className="sticky left-0 z-10 bg-blue-100 border-r border-gray-200 px-3 py-1"></th>
                    {weekDays.map(d => (
                      <>
                        <th key={`${d.getDate()}-bs`} className="px-1 py-1 border-r border-blue-50 font-medium text-center w-[65px]">BS</th>
                        <th key={`${d.getDate()}-dd`} className="px-1 py-1 border-r border-gray-200 font-medium text-center w-[65px]">ĐD/HS/KTV</th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept, ri) => {
                    const rowBg = ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    return (
                      <tr key={dept.id} className={`${rowBg} border-b border-gray-100 hover:bg-blue-50/30`}>
                        <td className={`sticky left-0 z-10 ${rowBg} px-3 py-2 font-semibold text-blue-900 border-r border-gray-200 text-[11px] uppercase tracking-wide`}>
                          <div className="flex items-center gap-1">
                            <span>{dept.name}</span>
                            {lockedDepts.has(dept.id) && (
                              <span className="text-amber-600" title="Đã nộp/duyệt — chỉ admin sửa được">🔒</span>
                            )}
                          </div>
                        </td>
                        {weekDays.map(d => {
                          const dateStr = format(d,'yyyy-MM-dd')
                          const inMonth = d.getMonth() === month-1 && d.getFullYear() === year
                          const isWeekend = [0,6].includes(d.getDay())
                          const cellSchedules = schedMap[dateStr]?.[dept.id] || []
                          const bsSchedules = cellSchedules.filter(s=>s.user?.title==='Bác sĩ'||s.user?.title?.includes('BS'))
                          const ddSchedules = cellSchedules.filter(s=>!bsSchedules.includes(s))

                          const CellContent = ({items, type}: {items:any[], type:'BS'|'DD'}) => (
                            <td key={`${dateStr}-${dept.id}-${type}`}
                              className={`align-top border-r ${type==='DD'?'border-gray-200':'border-blue-50'} px-1 py-1 ${!inMonth?'bg-gray-100 opacity-30':''}  ${isWeekend?'bg-orange-50/40':''}`}>
                              <div className="space-y-1 min-h-[44px]">
                                {items.map(s=>{
                                  const code = s.shiftType?.code || 'T'
                                  const codeCls = SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-700 border-gray-300'
                                  return (
                                    <div key={s.id} className={`group rounded px-1 py-0.5 ${type==='BS'?'bg-blue-50 border border-blue-200':'bg-green-50 border border-green-200'}`}>
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

                          return (
                            <>
                              <CellContent key={`${dateStr}-bs`} items={bsSchedules} type="BS" />
                              <CellContent key={`${dateStr}-dd`} items={ddSchedules} type="DD" />
                            </>
                          )
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
            {/* Header */}
            <div className="text-center border-b pt-6 pb-4 px-6">
              <p className="text-xs uppercase text-gray-600 leading-relaxed">
                TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU<br/>
                <b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/>
                <span className="text-gray-500">Độc lập – Tự do – Hạnh phúc</span>
              </p>
              <h2 className="text-xl font-bold mt-4 uppercase">Đơn đề nghị đổi ca trực</h2>
            </div>
            <form onSubmit={handleSwapSubmit} className="px-8 py-5 space-y-4 text-sm">
              <p className="italic text-gray-500">
                Kính gửi: <b>Ban Giám đốc Trung tâm Y tế khu vực Liên Chiểu</b>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500">Người đề nghị:</span><br/>
                  <b className="text-gray-800">{user?.fullName}</b>
                  {user?.department && <span className="text-gray-500"> — {user.department.name}</span>}
                </div>
                <div>
                  <span className="text-gray-500">Ngày đề nghị:</span><br/>
                  <b className="text-gray-800">{format(new Date(),'dd/MM/yyyy')}</b>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <p className="text-xs text-blue-700 font-semibold uppercase">Thông tin ca trực gốc</p>
                <p>• Người trực: <b>{swapTarget.user?.fullName}</b></p>
                <p>• Ngày trực: <b>{format(new Date(swapTarget.shiftDate),'EEEE, dd/MM/yyyy')}</b></p>
                <p>• Vị trí trực: <b>{swapTarget.department?.name}</b></p>
                <p>• Mã ca: <b>{swapTarget.shiftType?.code} — {swapTarget.shiftType?.name}</b></p>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  1. Người trực thay <span className="text-red-500">*</span>
                </label>
                <select value={swapForm.targetUserId} onChange={e=>setSwapForm({...swapForm,targetUserId:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm" required>
                  <option value="">— Chọn người trực thay (cùng khoa) —</option>
                  {users.filter(u=>u.id!==swapTarget.userId&&u.departmentId===swapTarget.departmentId).map(u=>(
                    <option key={u.id} value={u.id}>{u.fullName} {u.title?`(${u.title})`:''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  2. Lý do đổi trực <span className="text-red-500">*</span>
                </label>
                <textarea value={swapForm.reason} onChange={e=>setSwapForm({...swapForm,reason:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={4}
                  placeholder="VD: Đi công tác, hiếu hỉ gia đình, sự cố cá nhân..." required/>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                <b>Cam kết:</b> Tôi xin cam kết các thông tin trên là đúng sự thật. Đã trao đổi và được sự đồng ý của người trực thay.
                Yêu cầu chỉ có hiệu lực sau khi <b>Ban Giám đốc / Quản trị viên</b> phê duyệt.
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={()=>setShowSwapModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Huỷ</button>
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
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required>
                  <option value="">Chọn khoa/phòng</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ngày trực</label>
                <input type="date" value={form.shiftDate} onChange={e=>setForm({...form,shiftDate:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mã ca trực <span className="text-gray-400 text-xs">(ký hiệu chấm trực)</span></label>
                <select value={form.shiftTypeId} onChange={e=>setForm({...form,shiftTypeId:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">— Tự động chọn theo ngày —</option>
                  {shiftTypes.map(st=>(
                    <option key={st.id} value={st.id}>{st.code} — {st.name}</option>
                  ))}
                </select>
              </div>
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
