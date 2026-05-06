'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, userApi, departmentApi } from '@/lib/api'
import { format, getDaysInMonth, startOfMonth } from 'date-fns'
import { vi } from 'date-fns/locale'

const SHIFT_COLORS: Record<string, string> = {
  default: 'bg-blue-100 text-blue-800',
}

export default function SchedulesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [schedules, setSchedules] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ userId: '', departmentId: '', shiftTypeId: '', shiftDate: '', note: '' })

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    setUser(JSON.parse(u))
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        scheduleApi.list({ year, month, departmentId: selectedDept || undefined }),
        departmentApi.list(),
      ])
      setSchedules(s)
      setDepartments(d)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }, [year, month, selectedDept, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (user?.role !== 'staff') {
      userApi.list(selectedDept || undefined).then(setUsers).catch(() => {})
    }
  }, [user, selectedDept])

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const grouped: Record<string, any[]> = {}
  schedules.forEach(s => {
    const day = new Date(s.shiftDate).getDate()
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(s)
  })

  const handleApprove = async (id: string) => {
    await scheduleApi.approve(id)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa ca trực này?')) return
    await scheduleApi.delete(id)
    load()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await scheduleApi.create(form)
      setShowForm(false)
      setForm({ userId: '', departmentId: '', shiftTypeId: '', shiftDate: '', note: '' })
      load()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Lỗi tạo lịch')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-xl font-bold text-gray-800">Lịch Trực Tháng</h1>
          <div className="flex items-center gap-2 ml-auto">
            <select value={month} onChange={e => setMonth(+e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              {Array.from({length:12},(_,i)=>i+1).map(m=>(
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              {[2024,2025,2026,2027].map(y=>(
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {user?.role === 'admin' && (
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">Tất cả khoa</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {(user?.role === 'admin' || user?.role === 'department_lead') && (
              <button onClick={() => setShowForm(true)}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                + Thêm ca trực
              </button>
            )}
          </div>
        </div>

        {/* Schedule Grid */}
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {['CN','T2','T3','T4','T5','T6','T7'].map(d=>(
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
            ))}
            {Array.from({length: new Date(year, month-1, 1).getDay()}).map((_,i)=>(
              <div key={`empty-${i}`}/>
            ))}
            {days.map(day => {
              const date = new Date(year, month-1, day)
              const isWeekend = [0,6].includes(date.getDay())
              const daySchedules = grouped[day] || []
              return (
                <div key={day} className={`min-h-24 border rounded-lg p-1.5 ${isWeekend ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
                  <div className={`text-xs font-semibold mb-1 ${isWeekend ? 'text-orange-600' : 'text-gray-600'}`}>{day}</div>
                  <div className="space-y-0.5">
                    {daySchedules.map(s => (
                      <div key={s.id} className="bg-blue-100 text-blue-800 text-xs rounded px-1 py-0.5 flex items-center justify-between group">
                        <span className="truncate">{s.user?.fullName?.split(' ').pop()}</span>
                        <div className="hidden group-hover:flex gap-0.5">
                          {s.status === 'draft' && user?.role === 'admin' && (
                            <button onClick={() => handleApprove(s.id)} className="text-green-600 hover:text-green-800 text-xs">✓</button>
                          )}
                          {(user?.role === 'admin' || user?.role === 'department_lead') && (
                            <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 rounded inline-block"/>Ca trực</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-50 border border-orange-200 rounded inline-block"/>Cuối tuần</span>
        </div>
      </div>

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
                  {users.map(u=><option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Khoa/Phòng</label>
                <select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required>
                  <option value="">Chọn khoa</option>
                  {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ngày trực</label>
                <input type="date" value={form.shiftDate} onChange={e=>setForm({...form,shiftDate:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <input type="text" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" placeholder="Tùy chọn"/>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Hủy
                </button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
