'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { swapApi } from '@/lib/api'
import { format } from 'date-fns'

const STATUS_LABEL: Record<string,string> = { pending:'Chờ duyệt', approved:'Đã duyệt', rejected:'Đã từ chối' }
const STATUS_BADGE: Record<string,string> = {
  pending:'bg-amber-100 text-amber-800',
  approved:'bg-green-100 text-green-800',
  rejected:'bg-red-100 text-red-700',
}

export default function SwapsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [swaps, setSwaps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    setUser(JSON.parse(u))
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try { setSwaps(await swapApi.list(filter || undefined)) }
    catch { router.push('/login') }
    finally { setLoading(false) }
  }, [filter, router])

  useEffect(() => { if (user) load() }, [user, load])

  const handleApprove = async (id: string) => {
    if (!confirm('Duyệt yêu cầu đổi trực này? Lịch trực sẽ được chuyển sang người được chọn.')) return
    const note = prompt('Ghi chú (tùy chọn):') || undefined
    try { await swapApi.approve(id, note); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleReject = async (id: string) => {
    const note = prompt('Lý do từ chối:')
    if (note === null) return
    try { await swapApi.reject(id, note); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Huỷ yêu cầu đổi trực này?')) return
    try { await swapApi.cancel(id); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const isAdmin = user?.role === 'admin'

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-lg font-bold text-gray-800">Yêu cầu đổi trực</h1>
          <select value={filter} onChange={e=>setFilter(e.target.value)}
            className="ml-auto border rounded-lg px-2 py-1 text-sm">
            <option value="">Tất cả</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Đã từ chối</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : swaps.length === 0 ? (
          <div className="bg-white rounded-xl p-10 text-center text-gray-400">
            <div className="text-4xl mb-3">🔁</div>
            <p>Chưa có yêu cầu đổi trực nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {swaps.map(s => (
              <div key={s.id} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(s.createdAt),'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex-1">
                        <div className="text-gray-500 text-xs">Ca trực gốc</div>
                        <div className="font-medium text-gray-800">
                          {s.requester.fullName} → ngày {format(new Date(s.schedule.shiftDate),'dd/MM/yyyy')}
                        </div>
                        <div className="text-xs text-gray-500">{s.schedule.department?.name}</div>
                      </div>
                      <div className="text-2xl text-orange-400">→</div>
                      <div className="flex-1">
                        <div className="text-gray-500 text-xs">Đổi cho</div>
                        <div className="font-medium text-orange-700">{s.targetUser.fullName}</div>
                      </div>
                    </div>
                    {s.reason && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                        <b>Lý do:</b> {s.reason}
                      </div>
                    )}
                    {s.reviewNote && (
                      <div className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                        <b>Ghi chú admin:</b> {s.reviewNote}
                      </div>
                    )}
                    {s.reviewedBy && (
                      <div className="mt-1 text-xs text-gray-400">
                        Duyệt bởi {s.reviewedBy.fullName} — {format(new Date(s.reviewedAt),'dd/MM/yyyy HH:mm')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {isAdmin && s.status === 'pending' && (
                      <>
                        <button onClick={()=>handleApprove(s.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">✓ Duyệt</button>
                        <button onClick={()=>handleReject(s.id)}
                          className="border border-red-300 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-50">✕ Từ chối</button>
                      </>
                    )}
                    {!isAdmin && s.status === 'pending' && s.requesterId === user.id && (
                      <button onClick={()=>handleCancel(s.id)}
                        className="border text-gray-600 px-3 py-1 rounded text-xs hover:bg-gray-50">Huỷ</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
