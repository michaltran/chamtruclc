'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { departmentApi } from '@/lib/api'

export default function DepartmentsPage() {
  const router = useRouter()
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editDept, setEditDept] = useState<any>(null)
  const [form, setForm] = useState({ code:'', name:'', description:'' })

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    if (parsed.role !== 'admin') { router.push('/schedules'); return }
    load()
  }, [router])

  const load = async () => {
    setLoading(true)
    try { setDepartments(await departmentApi.list()) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editDept) await departmentApi.update(editDept.id, form)
      else await departmentApi.create(form)
      setShowForm(false); setEditDept(null)
      setForm({ code:'', name:'', description:'' })
      load()
    } catch (err: any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleEdit = (d: any) => {
    setEditDept(d)
    setForm({ code:d.code, name:d.name, description:d.description||'' })
    setShowForm(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">Quản lý Khoa/Phòng</h1>
          <button onClick={()=>{setEditDept(null);setShowForm(true)}}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Thêm khoa/phòng
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Mã','Tên khoa/phòng','Mô tả','Số nhân viên','Thao tác'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map(d=>(
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono text-xs">{d.code}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.name}</td>
                    <td className="px-4 py-3 text-gray-500">{d.description||'-'}</td>
                    <td className="px-4 py-3 text-gray-600">{d._count?.users||0} người</td>
                    <td className="px-4 py-3">
                      <button onClick={()=>handleEdit(d)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Sửa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">{editDept ? 'Sửa khoa/phòng' : 'Thêm khoa/phòng'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Mã khoa *</label>
                <input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" placeholder="VD: NOI, NGOAI" required disabled={!!editDept}/>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Tên khoa/phòng *</label>
                <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mô tả</label>
                <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" rows={3}/>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>{setShowForm(false);setEditDept(null)}}
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
