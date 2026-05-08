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
  const [form, setForm] = useState<any>({ username:'', password:'', fullName:'', email:'', employeeCode:'', role:'staff', departmentIds:[] as string[], title:'', phone:'' })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDeptId, setFilterDeptId] = useState('')

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
      setForm({ username:'', password:'', fullName:'', email:'', employeeCode:'', role:'staff', departmentIds:[], title:'', phone:'' })
      load()
    } catch (err: any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  const handleEdit = (u: any) => {
    setEditUser(u)
    setForm({
      username: u.username,
      password: '',
      fullName: u.fullName,
      email: u.email || '',
      employeeCode: u.employeeCode || '',
      role: u.role,
      departmentIds: u.departmentIds && u.departmentIds.length > 0
        ? u.departmentIds
        : (u.departmentId ? [u.departmentId] : []),
      title: u.title || '',
      phone: u.phone || '',
    })
    setShowForm(true)
  }

  const toggleFormDept = (deptId: string) => {
    setForm((p: any) => {
      const ids: string[] = p.departmentIds || []
      return { ...p, departmentIds: ids.includes(deptId) ? ids.filter(x=>x!==deptId) : [...ids, deptId] }
    })
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

  // ===== Phân quyền pages =====
  const ALL_PAGES = [
    { key:'schedules',   label:'Lịch trực' },
    { key:'swaps',       label:'Đổi trực' },
    { key:'cham-truc',   label:'Chấm trực' },
    { key:'users',       label:'Quản lý nhân viên' },
    { key:'departments', label:'Quản lý khoa/phòng' },
  ]
  const [permModal, setPermModal] = useState<any>(null)
  const [permForm, setPermForm] = useState<string[]>([])
  const openPermModal = (u: any) => {
    setPermModal(u)
    setPermForm(u.pages || [])
  }
  const togglePerm = (key: string) => {
    setPermForm(p => p.includes(key) ? p.filter(x=>x!==key) : [...p, key])
  }
  const savePerm = async () => {
    try { await userApi.setPermissions(permModal.id, permForm); setPermModal(null); load() }
    catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
  }

  // ===== Import Excel =====
  const [showImport, setShowImport] = useState(false)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const XLSX = await import('xlsx')
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf, { type:'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<any>(ws)
    const mapped = rows.map(r => ({
      username: String(r['Username'] || r['username'] || '').trim(),
      fullName: String(r['Họ tên'] || r['fullName'] || '').trim(),
      employeeCode: String(r['Mã NV'] || r['employeeCode'] || '').trim(),
      departmentCode: String(r['Mã khoa'] || r['departmentCode'] || '').trim(),
      title: String(r['Chức danh'] || r['title'] || '').trim(),
      phone: String(r['SĐT'] || r['phone'] || '').trim(),
      email: String(r['Email'] || r['email'] || '').trim(),
      role: String(r['Vai trò'] || r['role'] || 'staff').trim() as 'admin'|'department_lead'|'staff',
    })).filter(r => r.username && r.fullName)
    setImportPreview(mapped)
  }
  const doImport = async () => {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      const r = await userApi.importBulk(importPreview)
      alert(`Đã nhập ${r.created}/${importPreview.length} nhân viên (bỏ qua ${r.skipped})`)
      setShowImport(false); setImportPreview([]); load()
    } catch(err:any) { alert(err.response?.data?.error || 'Lỗi') }
    finally { setImporting(false) }
  }
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const data = [
      { 'Username':'bs.nguyen.an', 'Họ tên':'Nguyễn Văn An', 'Mã NV':'NV001',
        'Mã khoa':'NOI', 'Chức danh':'Bác sĩ', 'SĐT':'0901234567', 'Email':'an@email.com', 'Vai trò':'staff' },
      { 'Username':'dd.tran.b', 'Họ tên':'Trần Thị B', 'Mã NV':'NV002',
        'Mã khoa':'NOI', 'Chức danh':'Điều dưỡng trưởng', 'SĐT':'', 'Email':'', 'Vai trò':'department_lead' },
    ]
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{wch:18},{wch:24},{wch:10},{wch:10},{wch:22},{wch:14},{wch:24},{wch:16}]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sach NV')
    XLSX.writeFile(wb, 'mau-import-nhan-vien.xlsx')
  }

  const roleLabel: Record<string,string> = { admin:'Quản trị', department_lead:'Trưởng đơn vị', staff:'Nhân viên' }
  const roleBadge: Record<string,string> = { admin:'bg-purple-100 text-purple-800', department_lead:'bg-blue-100 text-blue-800', staff:'bg-gray-100 text-gray-700' }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="text-xl font-bold text-gray-800">Quản lý Nhân viên</h1>
          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadTemplate}
              className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
              📄 Tải file mẫu
            </button>
            <button onClick={()=>setShowImport(true)}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700">
              📥 Import Excel
            </button>
            <button onClick={()=>{setEditUser(null);setShowForm(true)}}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
              + Thêm nhân viên
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              placeholder="🔍 Tìm theo tên, username hoặc mã NV..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <select value={filterDeptId} onChange={e=>setFilterDeptId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">— Tất cả khoa —</option>
            {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {(searchTerm || filterDeptId) && (
            <button onClick={()=>{setSearchTerm('');setFilterDeptId('')}}
              className="text-sm text-gray-500 hover:text-blue-600 underline">Xoá lọc</button>
          )}
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
                {users
                  .filter(u => {
                    if (searchTerm) {
                      const t = searchTerm.toLowerCase()
                      const matchName = (u.fullName||'').toLowerCase().includes(t)
                      const matchUser = (u.username||'').toLowerCase().includes(t)
                      const matchCode = (u.employeeCode||'').toLowerCase().includes(t)
                      if (!matchName && !matchUser && !matchCode) return false
                    }
                    if (filterDeptId) {
                      const inDept = u.departmentId === filterDeptId
                        || (u.departmentIds || []).includes(filterDeptId)
                      if (!inDept) return false
                    }
                    return true
                  })
                  .map(u=>(
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{u.username}</td>
                    <td className="px-4 py-3 text-gray-500">{u.employeeCode||'-'}</td>
                    <td className="px-4 py-3">
                      {(u.departments && u.departments.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.departments.map((d: any) => (
                            <span key={d.id} className={`px-1.5 py-0.5 rounded text-[10px] ${d.isPrimary ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-gray-100 text-gray-600'}`}
                              title={d.isPrimary ? 'Khoa chính' : 'Kiêm nhiệm'}>
                              {d.name}{d.isPrimary && ' ★'}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
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
                        {u.canLogin && (
                          <button onClick={()=>openPermModal(u)} className="text-purple-600 hover:text-purple-800 text-xs font-medium">Quyền trang</button>
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
                  <label className="text-sm font-medium text-gray-700">Vai trò hệ thống</label>
                  <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    <option value="staff">Nhân viên (chỉ xem lịch của mình)</option>
                    <option value="department_lead">Trưởng đơn vị (Trưởng khoa / ĐD trưởng / KTV trưởng)</option>
                    <option value="admin">Quản trị (P. KH-NV / Ban Giám đốc)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">
                    Khoa/Phòng <span className="text-gray-400 font-normal text-xs">(có thể chọn nhiều khoa nếu kiêm nhiệm)</span>
                  </label>
                  <div className="border rounded-lg p-2 mt-1 max-h-40 overflow-y-auto bg-white">
                    <div className="grid grid-cols-2 gap-1">
                      {departments.map(d => (
                        <label key={d.id} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-blue-50 cursor-pointer">
                          <input type="checkbox" checked={(form.departmentIds || []).includes(d.id)}
                            onChange={()=>toggleFormDept(d.id)}/>
                          <span>{d.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {(form.departmentIds || []).length > 0 && (
                    <div className="mt-1 text-xs text-blue-700">
                      <b>{form.departmentIds.length}</b> khoa được chọn — khoa đầu tiên sẽ là khoa chính.
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Chức danh / Vị trí</label>
                  <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
                    list="title-presets"
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"
                    placeholder="VD: Bác sĩ"/>
                  <datalist id="title-presets">
                    <option value="Bác sĩ"/>
                    <option value="Trưởng khoa"/>
                    <option value="Phó Trưởng khoa"/>
                    <option value="Điều dưỡng trưởng"/>
                    <option value="Kỹ thuật viên trưởng"/>
                    <option value="Hộ sinh trưởng"/>
                    <option value="Điều dưỡng"/>
                    <option value="Hộ sinh"/>
                    <option value="Kỹ thuật viên"/>
                    <option value="Dược sĩ"/>
                    <option value="Hộ lý"/>
                    <option value="Lái xe"/>
                  </datalist>
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

      {/* Modal phân quyền pages */}
      {permModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-1">Phân quyền truy cập trang</h2>
            <p className="text-xs text-gray-500 mb-4">{permModal.fullName} ({permModal.username})</p>
            <div className="space-y-2">
              {ALL_PAGES.map(p => (
                <label key={p.key} className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={permForm.includes(p.key)} onChange={()=>togglePerm(p.key)}/>
                  <span className="text-sm">{p.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setPermModal(null)} className="flex-1 border py-2 rounded-lg text-sm">Hủy</button>
              <button onClick={savePerm} className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700">Lưu quyền</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-3">Import danh sách nhân viên từ Excel</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-800">
              <b>Hướng dẫn:</b> File Excel cần có các cột: <b>Username, Họ tên, Mã NV, Mã khoa, Chức danh, SĐT, Email, Vai trò</b>.
              <button onClick={downloadTemplate} className="ml-2 underline text-blue-700">Tải file mẫu</button>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleImportFile}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 mb-3"/>

            {importPreview.length > 0 && (
              <div className="border rounded-lg overflow-auto max-h-80 mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Username</th>
                      <th className="px-2 py-1 text-left">Họ tên</th>
                      <th className="px-2 py-1 text-left">Mã NV</th>
                      <th className="px-2 py-1 text-left">Khoa</th>
                      <th className="px-2 py-1 text-left">Chức danh</th>
                      <th className="px-2 py-1 text-left">SĐT</th>
                      <th className="px-2 py-1 text-left">Vai trò</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{r.username}</td>
                        <td className="px-2 py-1 font-medium">{r.fullName}</td>
                        <td className="px-2 py-1 text-gray-500">{r.employeeCode}</td>
                        <td className="px-2 py-1">{r.departmentCode}</td>
                        <td className="px-2 py-1 text-gray-600">{r.title}</td>
                        <td className="px-2 py-1 text-gray-500">{r.phone}</td>
                        <td className="px-2 py-1 text-gray-600">{r.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {importPreview.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-3">
                Sẽ nhập <b>{importPreview.length}</b> nhân viên. Nhân viên import vào sẽ <b>chưa có quyền đăng nhập</b> — admin cần "Cấp login" sau.
              </p>
            )}

            <div className="flex gap-2">
              <button onClick={()=>{setShowImport(false);setImportPreview([])}} className="flex-1 border py-2 rounded-lg text-sm">Hủy</button>
              <button disabled={importPreview.length===0||importing} onClick={doImport}
                className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
                {importing ? 'Đang nhập...' : `Nhập ${importPreview.length} nhân viên`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
