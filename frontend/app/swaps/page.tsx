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
  const [printSwap, setPrintSwap] = useState<any>(null)

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
                    <button onClick={()=>setPrintSwap(s)}
                      className="border border-blue-300 text-blue-700 px-3 py-1 rounded text-xs hover:bg-blue-50">
                      📄 Xem & In đơn
                    </button>
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

      {/* Print form modal — đơn đề nghị đổi ca trực có chỗ ký */}
      {printSwap && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto py-6 print:bg-white print:py-0">
          <div className="bg-white max-w-3xl mx-auto rounded-2xl shadow-xl print:shadow-none print:rounded-none print:max-w-none">
            {/* Modal toolbar — hidden on print */}
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-b print:hidden">
              <button onClick={()=>window.print()} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">🖨️ In đơn</button>
              <button onClick={()=>setPrintSwap(null)} className="border px-3 py-1 rounded text-sm hover:bg-gray-50">Đóng</button>
            </div>

            <div className="px-10 py-6 print:px-12 print:py-8 text-sm">
              {/* Header */}
              <div className="grid grid-cols-2 mb-6">
                <div className="text-center text-xs uppercase">
                  <div>TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
                  <div>PHÒNG KẾ HOẠCH - NGHIỆP VỤ</div>
                  <div className="w-24 mx-auto mt-1 border-t border-black"></div>
                </div>
                <div className="text-center text-xs uppercase">
                  <div className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                  <div>Độc lập - Tự do - Hạnh phúc</div>
                  <div className="w-32 mx-auto mt-1 border-t border-black"></div>
                </div>
              </div>

              <div className="text-right text-xs italic mb-3">
                Đà Nẵng, ngày {format(new Date(printSwap.createdAt),'dd')} tháng {format(new Date(printSwap.createdAt),'MM')} năm {format(new Date(printSwap.createdAt),'yyyy')}
              </div>

              <h1 className="text-center text-lg font-bold uppercase mb-1">Đơn đề nghị đổi ca trực</h1>
              <div className="text-center text-xs italic mb-5">
                Kính gửi: <b>Ban Giám đốc Trung tâm Y tế khu vực Liên Chiểu</b><br/>
                <span className="text-gray-600">Đồng kính gửi: Phòng Kế hoạch - Nghiệp vụ</span>
              </div>

              {/* Body */}
              <div className="space-y-2 leading-relaxed">
                <p>Tôi tên là: <b>{printSwap.requester.fullName}</b></p>
                <p>Đơn vị công tác: <b>{printSwap.schedule.department?.name || '—'}</b></p>
                <p>Theo lịch trực phân công, tôi có ca trực vào ngày <b>{format(new Date(printSwap.schedule.shiftDate),'dd/MM/yyyy')}</b> tại
                vị trí <b>{printSwap.schedule.department?.name}</b>, mã ca <b>{printSwap.schedule.shiftType?.code} — {printSwap.schedule.shiftType?.name}</b>.</p>
                <p>Vì <b>{printSwap.reason || '(lý do cá nhân)'}</b>, tôi không thể thực hiện ca trực này.</p>
                <p>Tôi xin đề nghị Ban Giám đốc xem xét, cho phép tôi được đổi ca trực với:</p>
                <p className="ml-6">
                  Ông/Bà: <b>{printSwap.targetUser.fullName}</b>
                </p>
                <p>Tôi xin cam kết các thông tin trên là đúng sự thật và đã trao đổi, được sự đồng ý của người trực thay.</p>
                <p>Kính mong Ban Giám đốc xem xét và phê duyệt.</p>
                <p className="italic">Tôi xin chân thành cảm ơn!</p>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-4 gap-4 text-xs text-center mt-10">
                <div>
                  <div className="font-bold uppercase">Người đề nghị</div>
                  <div className="italic text-[10px]">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                  <div className="font-medium">{printSwap.requester.fullName}</div>
                </div>
                <div>
                  <div className="font-bold uppercase">Trưởng khoa /<br/>ĐD trưởng /<br/>KTV trưởng</div>
                  <div className="italic text-[10px]">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                </div>
                <div>
                  <div className="font-bold uppercase">P. Kế hoạch -<br/>Nghiệp vụ</div>
                  <div className="italic text-[10px]">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                  {printSwap.reviewedBy && printSwap.status === 'approved' && (
                    <div className="font-medium">{printSwap.reviewedBy.fullName}</div>
                  )}
                </div>
                <div>
                  <div className="font-bold uppercase">Giám đốc</div>
                  <div className="italic text-[10px]">(Ký, ghi rõ họ tên<br/>và đóng dấu)</div>
                  <div className="h-16"></div>
                </div>
              </div>

              {/* Status footer */}
              <div className="mt-6 text-[10px] text-gray-500 print:hidden">
                Trạng thái: <span className={`px-2 py-0.5 rounded ${STATUS_BADGE[printSwap.status]}`}>{STATUS_LABEL[printSwap.status]}</span>
                {printSwap.reviewNote && <> — Ghi chú: <i>{printSwap.reviewNote}</i></>}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          .print\\:hidden { display: none !important; }
          nav { display: none !important; }
          body { font-size: 11pt; line-height: 1.5; }
        }
      `}</style>
    </div>
  )
}
