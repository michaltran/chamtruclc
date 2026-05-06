'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { userApi, departmentApi } from '@/lib/api'

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [form, setForm] = useState({ username:'', password:'', fullName:'', email:'', employeeCode:'', role:'staff', departmentId:'', title:'', phone:'' })

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    if (parsed.role === 'staff') { router.push('/schedules'); return }
    load()
    departmentApi.list().then(setDepartments)
  }, [router])

  const load = async () => {
    setLoading(true)
    try { setUsers(await userApi.list()) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editUser) {
        const { password, username, ...rest } = form
        await userApi.update(editUser.id, rest)
      } else {
        await userApi.create(form)
      }
      setShowForm(false); setEditUser(null)
      setForm({ username:'', password:'', fullName:'', email:'', employeeCode:'', role:'staff', departmentId:'', title:'', phone:'' })
      load()
    } catch (err: any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleEdit = (u: any) => {
    setEditUser(u)
    setForm({ username:u.username, password:'', fullName:u.fullName, email:u.email||'', employeeCode:u.employeeCode||'', role:u.role, departmentId:u.departmentId||'', title:u.title||'', phone:u.phone||'' })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Vô hiệu hóa tài khoản này?')) return
    await userApi.delete(id)
    load()
  }

  const handleGrantLogin = async (u: any) => {
    const password = prompt(`Cấp quyền đăng nhập cho ${u.fullName}\n\nMật khẩu mới (tối thiểu 6 ký tự):`)
    if (!password || password.length < 6) return
    const role = prompt('Vai trò: admin / department_lead / staff', 'staff') as any
    if (!['admin','department_lead','staff'].includes(role)) { alert('Vai trò không hợp lệ'); return }
    try { await userApi.grantLogin(u.id, { password, role }); alert('Đã cấp quyền đăng nhập'); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleRevokeLogin = async (u: any) => {
    if (!confirm(`Thu hồi quyền đăng nhập của ${u.fullName}? Tài khoản sẽ không đăng nhập được nữa.`)) return
    try { await userApi.revokeLogin(u.id); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const roleLabel: Record<string,string> = { admin:'Quản trị', department_lead:'Trưởng khoa', staff:'Nhân viên' }
  const roleBadge: Record<string,string> = { admin:'bg-purple-100 text-purple-800', department_lead:'bg-blue-100 text-blue-800', staff:'bg-gray-100 text-gray-700' }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800">Quản lý Nhân viên</h1>
          <button onClick={()=>{setEditUser(null);setShowForm(true)}}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Thêm nhân viên
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Họ tên','Tên đăng nhập','Mã NV','Khoa/Phòng','Chức vụ','Vai trò','Đăng nhập','Thao tác'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u=>(
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{u.username}</td>
                    <td className="px-4 py-3 text-gray-500">{u.employeeCode||'-'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.department?.name||'-'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.title||'-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role]}`}>
                        {roleLabel[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.canLogin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          ✓ Đã cấp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                          Chưa cấp
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={()=>handleEdit(u)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Sửa</button>
                        {u.canLogin ? (
                          <button onClick={()=>handleRevokeLogin(u)} className="text-orange-600 hover:text-orange-800 text-xs font-medium">Thu hồi login</button>
                        ) : (
                          <button onClick={()=>handleGrantLogin(u)} className="text-green-600 hover:text-green-800 text-xs font-medium">Cấp login</button>
                        )}
                        <button onClick={()=>handleDelete(u.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Xóa</button>
                      </div>
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{editUser ? 'Sửa nhân viên' : 'Thêm nhân viên'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {!editUser && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Tên đăng nhập *</label>
                    <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
                  </div>
                )}
                {!editUser && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Mật khẩu *</label>
                    <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required={!editUser}/>
                  </div>
                )}
                <div className={editUser ? 'col-span-2' : ''}>
                  <label className="text-sm font-medium text-gray-700">Họ tên *</label>
                  <input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" required/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Mã nhân viên</label>
                  <input value={form.employeeCode} onChange={e=>setForm({...form,employeeCode:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Vai trò</label>
                  <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    <option value="staff">Nhân viên</option>
                    <option value="department_lead">Trưởng khoa</option>
                    <option value="admin">Quản trị</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Khoa/Phòng</label>
                  <select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    <option value="">Chưa phân công</option>
                    {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Chức danh</label>
                  <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"/>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Điện thoại</label>
                  <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"/>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>{setShowForm(false);setEditUser(null)}}
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
