'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, departmentApi, userApi } from '@/lib/api'
import { getDaysInMonth } from 'date-fns'

// Map mã khoa con → tên khoa cha hiển thị trong chấm trực
// (Ở lịch trực vẫn giữ chi tiết các sub-position; ở chấm trực gộp về khoa cha)
const PARENT_GROUP: Record<string, string> = {
  'LANHDAO':  'Lãnh đạo',
  'CC-HSTC':  'Khoa Cấp cứu - Hồi sức Tích cực',
  'CC-NGOAI': 'Khoa Ngoại',
  'NGOAI':    'Khoa Ngoại',
  'GMHS':     'Khoa Gây mê hồi sức',
  'CC-SAN':   'Khoa Phụ Sản',
  'SAN':      'Khoa Phụ Sản',
  'NOI':      'Khoa Nội',
  'NHI':      'Khoa Nhi',
  'YHCT':     'Khoa YHCT – PHCN',
  'LCK':      'Khoa Liên Chuyên khoa',
  'SAM':      'Khoa Chẩn đoán hình ảnh',
  'CT':       'Khoa Chẩn đoán hình ảnh',
  'XQUANG':   'Khoa Chẩn đoán hình ảnh',
  'XN':       'Khoa Xét nghiệm',
  'VP':       'Phòng Viện phí',
  'LX':       'Lái xe',
  'HL-CC':    'Hộ lý',
  'HL':       'Hộ lý',
}
const PARENT_ORDER = [
  'Lãnh đạo','Khoa Cấp cứu - Hồi sức Tích cực','Khoa Ngoại','Khoa Gây mê hồi sức',
  'Khoa Phụ Sản','Khoa Nội','Khoa Nhi','Khoa YHCT – PHCN','Khoa Liên Chuyên khoa',
  'Khoa Chẩn đoán hình ảnh','Khoa Xét nghiệm','Phòng Viện phí','Lái xe','Hộ lý',
]
const DEPT_ORDER = [
  'CC-HSTC','HL-CC','CC-NGOAI','NGOAI','GMHS','CC-SAN','SAN','NOI','NHI','YHCT','LCK','SAM','CT','XQUANG','XN','VP','LX','HL'
]

const titleRank = (title?: string) => {
  if (!title) return 99
  const t = title.toLowerCase()
  if (t.includes('bác sĩ') || t === 'bs') return 0
  if (t.includes('lãnh đạo')) return 1
  if (/tr[ưu]ởng\s*khoa|ph[óo]\s*tr[ưu]ởng\s*khoa|ph[óo]\s*khoa|gi[áa]m\s*đ[ốo]c/.test(t)) return 0
  if (t.includes('điều dưỡng') || t.includes('hộ sinh') || t.includes('kỹ thuật')) return 2
  return 50
}

// 9 mã chuẩn (không có TLD/CLD/LLD — Lãnh đạo dùng chung T/C/L)
const SHIFT_CODE_COLORS: Record<string, string> = {
  T:   'bg-blue-100 text-blue-800',
  C:   'bg-green-100 text-green-800',
  L:   'bg-orange-100 text-orange-800',
  TC:  'bg-teal-100 text-teal-800',
  CC:  'bg-red-100 text-red-800',
  LC:  'bg-yellow-100 text-yellow-800',
  THS: 'bg-indigo-100 text-indigo-800',
  CHS: 'bg-purple-100 text-purple-800',
  LHS: 'bg-pink-100 text-pink-800',
}

const SHIFT_CODE_NAMES: Record<string, string> = {
  T:   'Trực bình thường trong tuần 24/24',
  C:   'Trực bình thường thứ 7, CN 24/24',
  L:   'Trực bình thường ngày Lễ 24/24',
  TC:  'Trực cấp cứu trong tuần 24/24',
  CC:  'Trực cấp cứu thứ 7, CN 24/24',
  LC:  'Trực cấp cứu ngày Lễ 24/24',
  THS: 'Phiên trực ngày thường hồi sức hồi tỉnh 24/24',
  CHS: 'Phiên trực thứ 7, CN hồi sức hồi tỉnh 24/24',
  LHS: 'Phiên trực ngày Lễ, tết hồi sức hồi tỉnh 24/24',
}

// Đúng layout sheet "Chấm trực ALL T*" của TTYT KV Liên Chiểu:
//   Group "Ngày thường" (TC | T | THS)
//   Group "T7, CN"      (CC | C | CHS)
//   Group "Lễ, tết"     (LC | L | LHS)
//   TC ngày CC     = TC + CC + LC      (tổng phiên cấp cứu)
//   TC ngày thường = T  + C  + L       (tổng phiên thường)
//   TC trực Hồi sức= THS+ CHS+ LHS     (tổng phiên hồi sức)
//   Tổng cộng      = sum 9 ô đếm
const COUNT_COLS = ['TC','T','THS','CC','C','CHS','LC','L','LHS'] as const
type CountCode = typeof COUNT_COLS[number]
// Bảng Lãnh đạo cũng dùng T/C/L (không có mã riêng)
const LD_COUNT_COLS = ['T','C','L'] as const
type LdCode = typeof LD_COUNT_COLS[number]

export default function ChamTrucPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [schedules, setSchedules] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('')

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    // Cho phép truy cập nếu role=admin HOẶC pages chứa 'cham-truc'
    const allowed = parsed.role === 'admin' || (parsed.pages || []).includes('cham-truc')
    if (!allowed) { router.push('/schedules'); return }
    setAuthUser(parsed)
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, u] = await Promise.all([
        scheduleApi.list({ year, month }),
        departmentApi.list(),
        userApi.list(),
      ])
      setSchedules(s)
      const sorted = [...d].sort((a,b) => {
        const ai = DEPT_ORDER.indexOf(a.code), bi = DEPT_ORDER.indexOf(b.code)
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
        if (ai === -1) return 1; if (bi === -1) return -1
        return ai - bi
      })
      setDepartments(sorted)
      setAllUsers(u)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }, [year, month, router])

  useEffect(() => { if (authUser) load() }, [load, authUser])

  const daysInMonth = useMemo(() => getDaysInMonth(new Date(year, month - 1)), [year, month])
  const days = useMemo(() => Array.from({length: daysInMonth}, (_,i) => i+1), [daysInMonth])

  const dayLabels = useMemo(() => days.map(d => {
    const date = new Date(year, month-1, d)
    const dow = ['CN','T2','T3','T4','T5','T6','T7'][date.getDay()]
    const isWeekend = [0,6].includes(date.getDay())
    return { d, dow, isWeekend }
  }), [days, year, month])

  // attendMap: userId -> day -> shiftCode
  // counts: userId -> { TC,T,THS,CC,C,CHS,LC,L,LHS }
  const { attendMap, counts } = useMemo(() => {
    const a: Record<string, Record<number, string>> = {}
    const c: Record<string, Record<CountCode, number>> = {}
    for (const s of schedules) {
      const day = new Date(s.shiftDate).getDate()
      const code = (s.shiftType?.code || 'T') as CountCode
      if (!a[s.userId]) a[s.userId] = {}
      a[s.userId][day] = code
      if (!c[s.userId]) c[s.userId] = { TC:0,T:0,THS:0,CC:0,C:0,CHS:0,LC:0,L:0,LHS:0 }
      if (COUNT_COLS.includes(code)) c[s.userId][code]++
    }
    return { attendMap: a, counts: c }
  }, [schedules])

  const dutyByDept = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const s of schedules) {
      if (!m[s.departmentId]) m[s.departmentId] = new Set()
      m[s.departmentId].add(s.userId)
    }
    return m
  }, [schedules])

  const displayDepts = filterDept
    ? departments.filter(d => d.id === filterDept)
    : departments

  if (!authUser) return null

  const sumGroup = (c: Record<CountCode, number> | undefined, codes: CountCode[]) =>
    codes.reduce((acc, k) => acc + (c?.[k] || 0), 0)

  // ============================================================
  // EXCEL EXPORT — xuất bảng chấm trực với format đẹp (ExcelJS)
  // Layout giống form trên web: 9 cột mã ca, 4 cột tổng, header bệnh viện
  // ============================================================
  const handleExportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const { saveAs } = await import('file-saver')

    // === Build groups (replicate logic render) ===
    const allDepts = filterDept ? departments.filter(d => d.id === filterDept) : departments
    const dutyUsers = allUsers.filter((u: any) => u.role !== 'admin')
    const userById = new Map(dutyUsers.map((u: any) => [u.id, u]))

    const groups: Record<string, { name: string; deptIds: string[]; users: any[] }> = {}
    PARENT_ORDER.forEach(g => { groups[g] = { name: g, deptIds: [], users: [] } })
    allDepts.forEach((d: any) => {
      const parent = PARENT_GROUP[d.code] || d.name
      if (!groups[parent]) groups[parent] = { name: parent, deptIds: [], users: [] }
      groups[parent].deptIds.push(d.id)
    })
    const homeParentByUser: Record<string, string> = {}
    dutyUsers.forEach((u: any) => {
      const primaryDept = (u.departments || []).find((d: any) => d.isPrimary) || (u.departments || [])[0]
      const code = primaryDept?.code || allDepts.find((d: any) => d.id === u.departmentId)?.code
      const parent = code ? PARENT_GROUP[code] : undefined
      if (parent && parent !== 'Lãnh đạo') homeParentByUser[u.id] = parent
    })
    schedules.forEach(s => {
      if (homeParentByUser[s.userId]) return
      const code = allDepts.find((d: any) => d.id === s.departmentId)?.code
      if (code && code !== 'LANHDAO' && PARENT_GROUP[code]) {
        homeParentByUser[s.userId] = PARENT_GROUP[code]
      }
    })
    Object.entries(homeParentByUser).forEach(([uid, parent]) => {
      const u = userById.get(uid)
      if (u && groups[parent]) groups[parent].users.push(u)
    })
    const ldUserIds = new Set<string>()
    schedules.forEach(s => {
      const code = allDepts.find((d: any) => d.id === s.departmentId)?.code
      if (code === 'LANHDAO') ldUserIds.add(s.userId)
    })
    ldUserIds.forEach(uid => {
      const u = userById.get(uid)
      if (u && groups['Lãnh đạo']) groups['Lãnh đạo'].users.push(u)
    })
    Object.values(groups).forEach(g => {
      g.users.sort((a: any, b: any) => {
        const ra = titleRank(a.title), rb = titleRank(b.title)
        if (ra !== rb) return ra - rb
        return (a.fullName || '').localeCompare(b.fullName || '')
      })
    })
    const orderedGroups = PARENT_ORDER.map(name => groups[name]).filter(g => g && g.users.length > 0)

    const buildGroupMaps = (groupDeptIds: string[]) => {
      const groupAttend: Record<string, Record<number, string>> = {}
      const groupCounts: Record<string, Record<string, number>> = {}
      const userDays: Record<string, Set<number>> = {}
      const groupSchedules = schedules.filter(s => groupDeptIds.includes(s.departmentId))
      for (const s of groupSchedules) {
        const day = new Date(s.shiftDate).getDate()
        const code = s.shiftType?.code || 'T'
        if (!userDays[s.userId]) userDays[s.userId] = new Set()
        if (userDays[s.userId].has(day)) continue
        userDays[s.userId].add(day)
        groupAttend[s.userId] = groupAttend[s.userId] || {}
        groupAttend[s.userId][day] = code
        groupCounts[s.userId] = groupCounts[s.userId] || {}
        groupCounts[s.userId][code] = (groupCounts[s.userId][code] || 0) + 1
      }
      return { groupAttend, groupCounts }
    }

    // === Excel workbook ===
    const wb = new ExcelJS.Workbook()
    wb.creator = 'TTYT KV Liên Chiểu'
    wb.created = new Date()
    const ws = wb.addWorksheet(`Chấm trực ${month}-${year}`, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', xSplit: 3, ySplit: 8, showGridLines: false }],
    })

    // 4 col total + 9 mã + days + 3 (STT, Họ tên, Chức danh)
    const dayCount = daysInMonth
    const totalCols = 3 + dayCount + 9 + 4 // STT, Họ tên, Chức danh, days, 9 codes, 4 totals
    const lastColLetter = (n: number) => {
      let s = ''
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
      return s
    }
    const lastCol = lastColLetter(totalCols)

    // Column widths
    ws.getColumn(1).width = 5  // STT
    ws.getColumn(2).width = 28 // Họ tên
    ws.getColumn(3).width = 16 // Chức danh
    for (let i = 0; i < dayCount; i++) ws.getColumn(4 + i).width = 4
    for (let i = 0; i < 9; i++) ws.getColumn(4 + dayCount + i).width = 5
    for (let i = 0; i < 4; i++) ws.getColumn(4 + dayCount + 9 + i).width = 8

    // === HEADER bệnh viện ===
    ws.mergeCells(`A1:${lastColLetter(Math.floor(totalCols / 2))}1`)
    ws.getCell('A1').value = 'SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG'
    ws.getCell('A1').font = { bold: true, size: 11 }
    ws.getCell('A1').alignment = { horizontal: 'center' }
    ws.mergeCells(`${lastColLetter(Math.floor(totalCols / 2) + 1)}1:${lastCol}1`)
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}1`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}1`).font = { bold: true, size: 11 }
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}1`).alignment = { horizontal: 'center' }

    ws.mergeCells(`A2:${lastColLetter(Math.floor(totalCols / 2))}2`)
    ws.getCell('A2').value = 'TTYT KHU VỰC LIÊN CHIỂU'
    ws.getCell('A2').font = { bold: true, size: 11 }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    ws.mergeCells(`${lastColLetter(Math.floor(totalCols / 2) + 1)}2:${lastCol}2`)
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}2`).value = 'Độc lập - Tự do - Hạnh phúc'
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}2`).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell(`${lastColLetter(Math.floor(totalCols / 2) + 1)}2`).font = { italic: true, size: 11 }

    ws.mergeCells(`A3:${lastColLetter(Math.floor(totalCols / 2))}3`)
    ws.getCell('A3').value = 'PHÒNG KẾ HOẠCH - NGHIỆP VỤ'
    ws.getCell('A3').font = { bold: true, size: 11 }
    ws.getCell('A3').alignment = { horizontal: 'center' }

    // Title
    ws.mergeCells(`A5:${lastCol}5`)
    ws.getCell('A5').value = 'BẢNG CHẤM CÔNG THƯỜNG TRỰC CHUYÊN MÔN Y TẾ ĐƯỢC PHỤ CẤP'
    ws.getCell('A5').font = { bold: true, size: 16 }
    ws.getCell('A5').alignment = { horizontal: 'center' }

    ws.mergeCells(`A6:${lastCol}6`)
    ws.getCell('A6').value = `Tháng ${month} năm ${year}`
    ws.getCell('A6').font = { italic: true, size: 12 }
    ws.getCell('A6').alignment = { horizontal: 'center' }

    // Color helpers
    const fill = (color: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: color } })
    const FILL_HEADER = fill('FFE6F0FB')
    const FILL_GROUP  = fill('FF1E40AF')
    const FILL_LD_GROUP = fill('FFB45309')
    const FILL_TOTAL_RED   = fill('FFFEE2E2')
    const FILL_TOTAL_BLUE  = fill('FFDBEAFE')
    const FILL_TOTAL_INDIGO= fill('FFE0E7FF')
    const FILL_TOTAL_GRAY  = fill('FFF3F4F6')
    const FILL_WEEKEND     = fill('FFFFF7ED')
    const FILL_T = fill('FFDBEAFE'); const FILL_C = fill('FFD1FAE5'); const FILL_L = fill('FFFFEDD5')
    const FILL_TC= fill('FFCCFBF1'); const FILL_CC= fill('FFFEE2E2'); const FILL_LC= fill('FFFEF3C7')
    const FILL_THS=fill('FFE0E7FF'); const FILL_CHS=fill('FFEDE9FE'); const FILL_LHS=fill('FFFCE7F3')
    const FILL_BY_CODE: Record<string, any> = { T:FILL_T, C:FILL_C, L:FILL_L, TC:FILL_TC, CC:FILL_CC, LC:FILL_LC, THS:FILL_THS, CHS:FILL_CHS, LHS:FILL_LHS }

    const border = {
      top: { style: 'thin' as const }, left: { style: 'thin' as const },
      bottom: { style: 'thin' as const }, right: { style: 'thin' as const }
    }

    let cur = 8
    orderedGroups.forEach(group => {
      const isLd = group.name === 'Lãnh đạo'

      // Group title row
      ws.mergeCells(`A${cur}:${lastCol}${cur}`)
      const groupCell = ws.getCell(`A${cur}`)
      groupCell.value = (isLd ? '★ ' : '') + group.name.toUpperCase()
      groupCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
      groupCell.fill = isLd ? FILL_LD_GROUP : FILL_GROUP
      groupCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      ws.getRow(cur).height = 22
      cur++

      // === Header row 1 ===
      const r1 = ws.getRow(cur)
      r1.values = [
        'STT', 'Họ và tên', 'Chức danh',
        ...dayLabels.map(({ d }) => d),
        'Ngày thường', null, null,
        'Thứ 7, CN', null, null,
        'Ngày Lễ, tết', null, null,
        'TC ngày CC', 'TC ngày thường', 'TC trực HS', 'Tổng cộng',
      ]
      // Group merge: 9 codes are 3 groups × 3
      const dayStartCol = 4
      const codeStart = dayStartCol + dayCount  // first code col (TC of "thường")
      ws.mergeCells(cur, codeStart,     cur, codeStart + 2)  // Ngày thường (TC, T, THS)
      ws.mergeCells(cur, codeStart + 3, cur, codeStart + 5)  // T7,CN
      ws.mergeCells(cur, codeStart + 6, cur, codeStart + 8)  // Lễ, tết
      // Day cells: rowSpan 2
      for (let i = 0; i < dayCount; i++) {
        ws.mergeCells(cur, dayStartCol + i, cur + 1, dayStartCol + i)
      }
      // STT, Họ tên, Chức danh: rowSpan 2
      ws.mergeCells(cur, 1, cur + 1, 1)
      ws.mergeCells(cur, 2, cur + 1, 2)
      ws.mergeCells(cur, 3, cur + 1, 3)
      // 4 totals: rowSpan 2
      const totalStart = codeStart + 9
      for (let i = 0; i < 4; i++) ws.mergeCells(cur, totalStart + i, cur + 1, totalStart + i)
      cur++

      // === Header row 2: 9 mã ca ===
      const r2 = ws.getRow(cur)
      const codeRowVals: any[] = []
      for (let i = 0; i < 3 + dayCount; i++) codeRowVals.push(null) // skip merged cells
      codeRowVals.push('TC', 'T', 'THS', 'CC', 'C', 'CHS', 'LC', 'L', 'LHS')
      r2.values = codeRowVals
      cur++

      // Style headers (apply to rows cur-2 and cur-1)
      const codeColors = ['TC','T','THS','CC','C','CHS','LC','L','LHS']
      for (let i = 0; i < 9; i++) {
        const cell = ws.getCell(cur - 1, codeStart + i)
        cell.fill = FILL_BY_CODE[codeColors[i]]
        cell.font = { bold: true, size: 9 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = border
      }
      // Day headers: số ngày + ngày trong tuần
      for (let i = 0; i < dayCount; i++) {
        const cell = ws.getCell(cur - 2, dayStartCol + i)
        const lbl = dayLabels[i]
        cell.value = `${lbl.d}\n${lbl.dow}`
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.font = { size: 8, bold: true }
        cell.fill = lbl.isWeekend ? FILL_WEEKEND : FILL_HEADER
        cell.border = border
      }
      // Other top-row labels
      ;[1, 2, 3].forEach(c => {
        const cell = ws.getCell(cur - 2, c)
        cell.font = { bold: true, size: 10 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.fill = FILL_HEADER
        cell.border = border
      })
      // Group sub-headers (Ngày thường / T7,CN / Lễ tết)
      const subLabels: Array<[string, any]> = [
        ['Ngày thường', FILL_T],
        ['Thứ 7, CN', FILL_C],
        ['Ngày Lễ, tết', FILL_L],
      ]
      for (let g = 0; g < 3; g++) {
        const cell = ws.getCell(cur - 2, codeStart + g * 3)
        cell.value = subLabels[g][0]
        cell.fill = subLabels[g][1]
        cell.font = { bold: true, size: 10 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = border
      }
      // 4 total headers
      const totalHeaders: Array<[string, any]> = [
        ['TC ngày CC', FILL_TOTAL_RED],
        ['TC ngày thường', FILL_TOTAL_BLUE],
        ['TC trực HS', FILL_TOTAL_INDIGO],
        ['Tổng cộng', FILL_TOTAL_GRAY],
      ]
      totalHeaders.forEach((spec, i) => {
        const cell = ws.getCell(cur - 2, totalStart + i)
        cell.value = spec[0]
        cell.fill = spec[1]
        cell.font = { bold: true, size: 9 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = border
      })
      ws.getRow(cur - 2).height = 32
      ws.getRow(cur - 1).height = 14

      // === Data rows ===
      const { groupAttend, groupCounts } = buildGroupMaps(group.deptIds)
      group.users.forEach((u: any, idx: number) => {
        const ua = groupAttend[u.id] || {}
        const uc = groupCounts[u.id] || {}
        const TC = uc.TC || 0, T = uc.T || 0, THS = uc.THS || 0
        const CC = uc.CC || 0, C = uc.C || 0, CHS = uc.CHS || 0
        const LC = uc.LC || 0, L = uc.L || 0, LHS = uc.LHS || 0
        const ccTotal = TC + CC + LC
        const normTotal = T + C + L
        const hsTotal = THS + CHS + LHS
        const grand = ccTotal + normTotal + hsTotal

        const row = ws.getRow(cur)
        row.values = [
          idx + 1, u.fullName, u.title || '',
          ...dayLabels.map(({ d }) => ua[d] || ''),
          TC || '', T || '', THS || '', CC || '', C || '', CHS || '', LC || '', L || '', LHS || '',
          ccTotal || '', normTotal || '', hsTotal || '', grand || '',
        ]
        // Format
        row.eachCell((cell, colNumber) => {
          cell.border = border
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          if (colNumber === 2) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
            cell.font = { bold: true, size: 10 }
          } else if (colNumber === 3) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
            cell.font = { size: 9, color: { argb: 'FF6B7280' } }
          } else {
            cell.font = { size: 10 }
          }
        })
        // Color day cells with code
        for (let i = 0; i < dayCount; i++) {
          const code = ua[dayLabels[i].d]
          const cell = ws.getCell(cur, dayStartCol + i)
          if (code && FILL_BY_CODE[code]) {
            cell.fill = FILL_BY_CODE[code]
            cell.font = { bold: true, size: 9 }
          }
          if (dayLabels[i].isWeekend && !code) {
            cell.fill = FILL_WEEKEND
          }
        }
        // Total cells: bold colored
        const totalFills = [FILL_TOTAL_RED, FILL_TOTAL_BLUE, FILL_TOTAL_INDIGO, FILL_TOTAL_GRAY]
        for (let i = 0; i < 4; i++) {
          const cell = ws.getCell(cur, totalStart + i)
          cell.fill = totalFills[i]
          cell.font = { bold: true, size: 11, color: { argb: ['FFB91C1C','FF1D4ED8','FF4338CA','FF111827'][i] } }
        }
        cur++
      })

      // === Group totals row ===
      const dayTotals: Record<number, number> = {}
      Object.values(groupAttend).forEach(map => {
        Object.keys(map).forEach(d => { dayTotals[+d] = (dayTotals[+d] || 0) + 1 })
      })
      const codeTotals: Record<string, number> = {}
      ;['TC','T','THS','CC','C','CHS','LC','L','LHS'].forEach(k => { codeTotals[k] = 0 })
      Object.values(groupCounts).forEach(c => {
        Object.keys(codeTotals).forEach(k => { codeTotals[k] += c[k] || 0 })
      })
      const totalRow = ws.getRow(cur)
      const ccTot = codeTotals.TC + codeTotals.CC + codeTotals.LC
      const noTot = codeTotals.T + codeTotals.C + codeTotals.L
      const hsTot = codeTotals.THS + codeTotals.CHS + codeTotals.LHS
      totalRow.values = [
        '', 'TỔNG CỘNG', '',
        ...dayLabels.map(({ d }) => dayTotals[d] || ''),
        codeTotals.TC || '', codeTotals.T || '', codeTotals.THS || '',
        codeTotals.CC || '', codeTotals.C || '', codeTotals.CHS || '',
        codeTotals.LC || '', codeTotals.L || '', codeTotals.LHS || '',
        ccTot || '', noTot || '', hsTot || '', (ccTot + noTot + hsTot) || '',
      ]
      ws.mergeCells(cur, 2, cur, 3)
      totalRow.eachCell(cell => {
        cell.border = border
        cell.font = { bold: true, size: 11 }
        cell.fill = isLd ? fill('FFFEF3C7') : fill('FFE5E7EB')
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      ws.getCell(cur, 2).alignment = { horizontal: 'center', vertical: 'middle' }
      cur++
      cur++ // separator
    })

    // Save
    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `bang-cham-truc-${month}-${year}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <Navbar />
      <div className="mx-auto px-3 py-4 max-w-[1800px]">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Chấm Trực</h1>
            <p className="text-xs text-gray-500">Bảng chấm công thường trực chuyên môn y tế</p>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select value={month} onChange={e=>setMonth(+e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm">
              {Array.from({length:12},(_,i)=>i+1).map(m=>(
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select value={year} onChange={e=>setYear(+e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm">
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm">
              <option value="">Tất cả khoa</option>
              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={handleExportExcel}
              className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700">
              📊 Xuất Excel
            </button>
            <button onClick={()=>window.print()}
              className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-gray-800">
              🖨️ In
            </button>
          </div>
        </div>

        {/* Print header — đúng mẫu Excel */}
        <div className="hidden print:block mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center uppercase print-header-name">
              <div>SỞ Y TẾ THÀNH PHỐ ĐÀ NẴNG</div>
              <div className="font-bold">TTYT KHU VỰC LIÊN CHIỂU</div>
              <div className="font-bold">PHÒNG KẾ HOẠCH - NGHIỆP VỤ</div>
              <div className="w-20 mx-auto mt-1 border-t border-black"></div>
            </div>
            <div className="text-center uppercase print-header-name">
              <div className="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="normal-case">Độc lập - Tự do - Hạnh phúc</div>
              <div className="w-32 mx-auto mt-1 border-t border-black"></div>
            </div>
          </div>
          <div className="text-center mt-3">
            <div className="print-title uppercase">BẢNG CHẤM CÔNG THƯỜNG TRỰC CHUYÊN MÔN Y TẾ ĐƯỢC PHỤ CẤP</div>
            <div className="print-subtitle">Tháng {month} năm {year}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (() => {
          // Build parent-group → { name, deptIds[], users[] }
          const groups: Record<string, { name: string; deptIds: string[]; users: any[] }> = {}
          PARENT_ORDER.forEach(g => { groups[g] = { name: g, deptIds: [], users: [] } })
          // Map each department (sub-position) to parent group
          const allDepts = filterDept ? departments.filter(d => d.id === filterDept) : departments
          allDepts.forEach(d => {
            const parent = PARENT_GROUP[d.code] || d.name
            if (!groups[parent]) groups[parent] = { name: parent, deptIds: [], users: [] }
            groups[parent].deptIds.push(d.id)
          })
          // Loại admin (quản lý) — admin không phải thành viên trực
          const dutyUsers = allUsers.filter(u => u.role !== 'admin')
          const userById = new Map(dutyUsers.map(u => [u.id, u]))

          // 1) User vào nhóm khoa cha theo HOME (primary dept) — không kể Lãnh đạo
          const homeParentByUser: Record<string, string> = {}
          dutyUsers.forEach(u => {
            const primaryDept = (u.departments || []).find((d:any) => d.isPrimary) || (u.departments || [])[0]
            const code = primaryDept?.code || allDepts.find(d => d.id === u.departmentId)?.code
            const parent = code ? PARENT_GROUP[code] : undefined
            if (parent && parent !== 'Lãnh đạo') homeParentByUser[u.id] = parent
          })

          // 2) Người chưa có home → suy ra từ schedule khoa chuyên môn (không tính LANHDAO)
          schedules.forEach(s => {
            if (homeParentByUser[s.userId]) return
            const code = allDepts.find(d => d.id === s.departmentId)?.code
            if (code && code !== 'LANHDAO' && PARENT_GROUP[code]) {
              homeParentByUser[s.userId] = PARENT_GROUP[code]
            }
          })

          // 3) Push vào nhóm khoa
          Object.entries(homeParentByUser).forEach(([uid, parent]) => {
            const u = userById.get(uid)
            if (u && groups[parent]) groups[parent].users.push(u)
          })

          // 4) Nhóm Lãnh đạo: BẤT KỲ user nào có schedule ở khoa LANHDAO đều được chấm thêm
          //    Họ vẫn xuất hiện ở khoa chuyên môn của họ (1 dòng) và đồng thời 1 dòng ở Lãnh đạo
          const ldUserIds = new Set<string>()
          schedules.forEach(s => {
            const code = allDepts.find(d => d.id === s.departmentId)?.code
            if (code === 'LANHDAO') ldUserIds.add(s.userId)
          })
          ldUserIds.forEach(uid => {
            const u = userById.get(uid)
            if (u && groups['Lãnh đạo']) groups['Lãnh đạo'].users.push(u)
          })
          // Sort users in each group: BS trước, ĐD sau
          Object.values(groups).forEach(g => {
            g.users.sort((a, b) => {
              const ra = titleRank(a.title), rb = titleRank(b.title)
              if (ra !== rb) return ra - rb
              return (a.fullName||'').localeCompare(b.fullName||'')
            })
          })
          const orderedGroups = PARENT_ORDER.map(name => groups[name]).filter(g => g && g.users.length > 0)

          // Hàm helper: build attend & counts cho 1 group, dedupe theo (user, day) — 1 công/ngày/group
          const buildGroupMaps = (groupDeptIds: string[]) => {
            const groupAttend: Record<string, Record<number, string>> = {}
            const groupCounts: Record<string, Record<string, number>> = {}
            const userDays: Record<string, Set<number>> = {}
            const groupSchedules = schedules.filter(s => groupDeptIds.includes(s.departmentId))
            for (const s of groupSchedules) {
              const day = new Date(s.shiftDate).getDate()
              const code = s.shiftType?.code || 'T'
              if (!userDays[s.userId]) userDays[s.userId] = new Set()
              if (userDays[s.userId].has(day)) continue // dedupe: 1 user 1 ngày = 1 công trong nhóm
              userDays[s.userId].add(day)
              groupAttend[s.userId] = groupAttend[s.userId] || {}
              groupAttend[s.userId][day] = code
              groupCounts[s.userId] = groupCounts[s.userId] || {}
              groupCounts[s.userId][code] = (groupCounts[s.userId][code] || 0) + 1
            }
            return { groupAttend, groupCounts }
          }

          // Ld dùng riêng — bảng đơn giản hơn (3 mã LD, không có BS/ĐD split)
          const renderLdGroup = (group: any) => {
            const { groupAttend, groupCounts } = buildGroupMaps(group.deptIds)
            // Day total Ld (số người trực lãnh đạo mỗi ngày)
            const dayTotals: Record<number, number> = {}
            Object.values(groupAttend).forEach(map => {
              Object.keys(map).forEach(d => { dayTotals[+d] = (dayTotals[+d] || 0) + 1 })
            })
            // Code totals
            const codeTotals: Record<string, number> = { T:0, C:0, L:0 }
            Object.values(groupCounts).forEach(c => {
              LD_COUNT_COLS.forEach(k => { codeTotals[k] += c[k] || 0 })
            })
            const grand = codeTotals.T + codeTotals.C + codeTotals.L
            return (
              <div key="ld-group" className="bg-white rounded-xl shadow-sm overflow-hidden print:rounded-none print:shadow-none print:break-inside-avoid border-2 border-amber-300">
                <div className="bg-amber-500 text-white px-4 py-2 print:bg-amber-100 print:text-amber-900">
                  <h2 className="font-bold text-sm uppercase tracking-wide">★ Trực Lãnh đạo</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="border px-2 py-1 text-center font-semibold w-10">STT</th>
                        <th className="border px-2 py-1 text-left font-semibold min-w-[160px]">Họ và tên</th>
                        {dayLabels.map(({d, dow, isWeekend}) => (
                          <th key={d} className={`border px-1 py-1 text-center w-9 ${isWeekend ? 'bg-orange-100 text-orange-700' : 'text-amber-800'}`}>
                            <div className="text-[10px]">{d}</div>
                            <div className="text-[8px] opacity-70">{dow}</div>
                          </th>
                        ))}
                        {LD_COUNT_COLS.map(c => (
                          <th key={c} className={`border px-1 py-1 text-center w-10 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                        ))}
                        <th className="border px-1 py-1 text-center font-bold text-amber-900 bg-amber-100 w-12">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.users.map((u: any, idx: number) => {
                        const userAttend = groupAttend[u.id] || {}
                        const userCounts = groupCounts[u.id] || {}
                        const total = (userCounts.T||0) + (userCounts.C||0) + (userCounts.L||0)
                        return (
                          <tr key={u.id} className="hover:bg-amber-50/40">
                            <td className="border px-2 py-1 text-center text-gray-500">{idx+1}</td>
                            <td className="border px-2 py-1 font-medium text-gray-800 whitespace-nowrap">
                              {u.fullName}
                              {u.title && <span className="ml-1 text-gray-400 font-normal text-[10px]">({u.title})</span>}
                            </td>
                            {dayLabels.map(({d, isWeekend}) => {
                              const code = userAttend[d]
                              const cls = code ? (SHIFT_CODE_COLORS[code] || 'bg-gray-100') : ''
                              return (
                                <td key={d} className={`border px-0.5 py-0.5 text-center ${isWeekend ? 'bg-orange-50/30' : ''}`}>
                                  {code && <span className={`inline-block rounded px-0.5 text-[9px] font-bold ${cls}`}>{code}</span>}
                                </td>
                              )
                            })}
                            {LD_COUNT_COLS.map(c => (
                              <td key={c} className="border px-1 py-1 text-center text-[10px]">{userCounts[c] || ''}</td>
                            ))}
                            <td className="border px-1 py-1 text-center bg-amber-200 text-amber-900 font-bold">{total || ''}</td>
                          </tr>
                        )
                      })}
                      {/* Tổng cộng riêng cho Lãnh đạo */}
                      <tr className="bg-amber-100 border-t-2 border-amber-400 font-bold">
                        <td colSpan={2} className="border px-2 py-1.5 text-amber-900 text-center uppercase">TỔNG CỘNG LÃNH ĐẠO</td>
                        {dayLabels.map(({d}) => (
                          <td key={d} className="border px-0.5 py-1 text-center text-amber-900 text-[11px]">{dayTotals[d] || ''}</td>
                        ))}
                        {LD_COUNT_COLS.map(c => (
                          <td key={c} className="border px-1 py-1 text-center text-amber-900">{codeTotals[c] || ''}</td>
                        ))}
                        <td className="border px-1 py-1 text-center bg-amber-300 text-amber-900 text-base">{grand || ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }

          return (<>
          <div className="space-y-6 print:space-y-3">
            {orderedGroups.map(group => {
              const allDeptUsers = group.users
              if (allDeptUsers.length === 0) return null
              if (group.name === 'Lãnh đạo') return renderLdGroup(group)
              const dept = { id: group.deptIds.join(','), name: group.name, code: group.name }
              const { groupAttend, groupCounts } = buildGroupMaps(group.deptIds)

              return (
                <div key={dept.id} className="bg-white rounded-xl shadow-sm overflow-hidden print:rounded-none print:shadow-none print:break-inside-avoid">
                  <div className="bg-blue-700 text-white px-4 py-2 print:bg-gray-200 print:text-black">
                    <h2 className="font-bold text-sm uppercase tracking-wide">{dept.name}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        {/* Row 1: top group headers */}
                        <tr className="bg-gray-50 border-b">
                          <th rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-2 py-1 text-center font-semibold text-gray-700 border w-10">STT</th>
                          <th rowSpan={2} className="sticky left-10 z-10 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-700 border min-w-[160px]">Họ và tên</th>
                          {dayLabels.map(({d, dow, isWeekend}) => (
                            <th key={d} rowSpan={2} className={`px-1 py-1 text-center border font-medium w-7 ${isWeekend ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}>
                              <div className="text-[10px]">{d}</div>
                              <div className="text-[8px] opacity-70">{dow}</div>
                            </th>
                          ))}
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-blue-50">Ngày thường</th>
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-orange-50">Ngày thứ 7, CN</th>
                          <th colSpan={3} className="px-1 py-1 text-center border font-semibold text-gray-700 bg-yellow-50">Ngày lễ, tết</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-red-700 bg-red-50 w-12">TC ngày CC</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-blue-700 bg-blue-50 w-12">TC ngày thường</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-indigo-700 bg-indigo-50 w-12">TC trực Hồi sức</th>
                          <th rowSpan={2} className="px-1 py-1 text-center border font-bold text-gray-800 bg-gray-100 w-12">Tổng cộng</th>
                        </tr>
                        {/* Row 2: 9 sub-codes */}
                        <tr className="bg-gray-50 border-b">
                          {(['TC','T','THS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                          {(['CC','C','CHS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                          {(['LC','L','LHS'] as const).map(c => (
                            <th key={c} className={`px-1 py-1 text-center border w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allDeptUsers.map((u, idx) => {
                          const userAttend = groupAttend[u.id] || {}
                          const userCounts = (groupCounts[u.id] || {}) as Record<CountCode, number>
                          const ccTotal = sumGroup(userCounts, ['TC','CC','LC'])
                          const normTotal = sumGroup(userCounts, ['T','C','L'])
                          const hsTotal = sumGroup(userCounts, ['THS','CHS','LHS'])
                          const grandTotal = ccTotal + normTotal + hsTotal
                          return (
                            <tr key={u.id} className="hover:bg-blue-50/20">
                              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-gray-500 border text-center">{idx+1}</td>
                              <td className="sticky left-10 z-10 bg-white px-2 py-1 font-medium text-gray-800 border whitespace-nowrap">
                                {u.fullName}
                                {u.title && <span className="ml-1 text-gray-400 font-normal text-[10px]">({u.title})</span>}
                              </td>
                              {dayLabels.map(({d, isWeekend}) => {
                                const code = userAttend[d]
                                const colorClass = code ? (SHIFT_CODE_COLORS[code] || 'bg-gray-100 text-gray-800') : ''
                                return (
                                  <td key={d} className={`px-0.5 py-0.5 text-center border ${isWeekend ? 'bg-orange-50/30' : ''}`}>
                                    {code && (
                                      <span className={`inline-block rounded px-0.5 text-[9px] font-bold ${colorClass}`}>
                                        {code}
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                              {/* 9 đếm theo mã */}
                              {COUNT_COLS.map(code => (
                                <td key={code} className="px-1 py-1 text-center border text-[10px]">
                                  {userCounts?.[code] || ''}
                                </td>
                              ))}
                              {/* 4 cột tổng */}
                              <td className="px-1 py-1 text-center border bg-red-50 font-bold text-red-700">{ccTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-blue-50 font-bold text-blue-700">{normTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-indigo-50 font-bold text-indigo-700">{hsTotal || ''}</td>
                              <td className="px-1 py-1 text-center border bg-gray-100 font-bold text-gray-800">{grandTotal || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}

            {schedules.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>Chưa có dữ liệu chấm trực tháng {month}/{year}</p>
              </div>
            )}

            {/* TỔNG CỘNG CÁC KHOA CHUYÊN MÔN — không tính lịch trực Lãnh đạo (đã có bảng riêng phía trên) */}
            {schedules.length > 0 && (() => {
              // Dedupe: 1 user 1 ngày trong cùng group = 1 công.
              // Để tổng đúng, đếm cho mỗi group rồi cộng lại.
              const dayTotalsAll: Record<number, number> = {}
              const codeTotalsAll: Record<string, number> = { TC:0,T:0,THS:0,CC:0,C:0,CHS:0,LC:0,L:0,LHS:0 }
              orderedGroups
                .filter(g => g.name !== 'Lãnh đạo')
                .forEach(g => {
                  const { groupAttend, groupCounts } = buildGroupMaps(g.deptIds)
                  Object.values(groupAttend).forEach(map => {
                    Object.keys(map).forEach(d => { dayTotalsAll[+d] = (dayTotalsAll[+d] || 0) + 1 })
                  })
                  Object.values(groupCounts).forEach(c => {
                    COUNT_COLS.forEach(k => { codeTotalsAll[k] += c[k] || 0 })
                  })
                })
              const ccA = codeTotalsAll.TC + codeTotalsAll.CC + codeTotalsAll.LC
              const noA = codeTotalsAll.T + codeTotalsAll.C + codeTotalsAll.L
              const hsA = codeTotalsAll.THS + codeTotalsAll.CHS + codeTotalsAll.LHS
              const allA = ccA + noA + hsA
              return (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border-2 border-blue-400">
                  <div className="bg-blue-700 text-white px-4 py-2">
                    <h2 className="font-bold text-sm uppercase tracking-wide">TỔNG CỘNG CÁC KHOA CHUYÊN MÔN — Tháng {month}/{year}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-blue-50">
                          <th colSpan={2} className="border px-2 py-1 text-left font-bold text-blue-900 min-w-[210px]">Số phiên trực mỗi ngày</th>
                          {dayLabels.map(({d, dow, isWeekend}) => (
                            <th key={d} className={`border px-1 py-1 text-center w-9 ${isWeekend ? 'bg-orange-100 text-orange-700' : 'text-blue-800'}`}>
                              <div className="text-[10px]">{d}</div>
                              <div className="text-[8px] opacity-70">{dow}</div>
                            </th>
                          ))}
                          {COUNT_COLS.map(c => (
                            <th key={c} className={`border px-1 py-1 text-center w-9 text-[10px] font-bold ${SHIFT_CODE_COLORS[c]}`}>{c}</th>
                          ))}
                          <th className="border px-1 py-1 text-center font-bold text-red-700 bg-red-50">TC ngày CC</th>
                          <th className="border px-1 py-1 text-center font-bold text-blue-700 bg-blue-50">TC ngày thường</th>
                          <th className="border px-1 py-1 text-center font-bold text-indigo-700 bg-indigo-50">TC trực Hồi sức</th>
                          <th className="border px-1 py-1 text-center font-bold text-blue-900 bg-blue-100">Tổng cộng</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="font-bold">
                          <td colSpan={2} className="border px-2 py-2 text-right text-blue-900 bg-blue-50">Toàn các khoa chuyên môn</td>
                          {dayLabels.map(({d}) => (
                            <td key={d} className="border px-0.5 py-2 text-center text-gray-800 text-[11px]">
                              {dayTotalsAll[d] || ''}
                            </td>
                          ))}
                          {COUNT_COLS.map(c => (
                            <td key={c} className="border px-1 py-2 text-center text-gray-800 text-[11px]">
                              {codeTotalsAll[c] || ''}
                            </td>
                          ))}
                          <td className="border px-1 py-2 text-center bg-red-100 text-red-800">{ccA || ''}</td>
                          <td className="border px-1 py-2 text-center bg-blue-100 text-blue-800">{noA || ''}</td>
                          <td className="border px-1 py-2 text-center bg-indigo-100 text-indigo-800">{hsA || ''}</td>
                          <td className="border px-1 py-2 text-center bg-blue-200 text-blue-900 text-base">{allA || ''}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 text-[10px] text-gray-500 italic">
                    * Tổng cộng Lãnh đạo được hiển thị riêng trong bảng "Trực Lãnh đạo" phía trên.
                  </div>
                </div>
              )
            })()}
          </div>
          </>)
        })()}

        {/* Legend - 9 ký hiệu chấm trực */}
        <div className="bg-white rounded-xl shadow-sm p-4 mt-4 print:hidden">
          <h3 className="text-xs font-bold text-gray-700 uppercase mb-2">Ký hiệu chấm trực</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {COUNT_COLS.map(code => (
              <div key={code} className="flex items-center gap-2">
                <span className={`inline-block w-10 text-center px-1 py-0.5 rounded font-bold ${SHIFT_CODE_COLORS[code]}`}>
                  {code}
                </span>
                <span className="text-gray-600 leading-tight">{SHIFT_CODE_NAMES[code]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t text-xs text-gray-600 leading-relaxed">
            <b>Công thức cột tổng:</b><br/>
            • <b className="text-red-700">TC ngày CC</b> = TC + CC + LC (tổng phiên trực cấp cứu)<br/>
            • <b className="text-blue-700">TC ngày thường</b> = T + C + L (tổng phiên trực bình thường)<br/>
            • <b className="text-indigo-700">TC trực Hồi sức</b> = THS + CHS + LHS (tổng phiên hồi sức hồi tỉnh)<br/>
            • <b>Tổng cộng</b> = TC ngày CC + TC ngày thường + TC trực Hồi sức
          </div>
        </div>

        {/* Print footer with signatures */}
        <div className="hidden print:block mt-6">
          <div className="grid grid-cols-3 gap-8 text-xs text-center">
            <div>
              <div className="font-semibold uppercase mb-12">Người lập</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-semibold uppercase mb-12">P. Kế hoạch - Nghiệp vụ</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-semibold uppercase mb-12">Giám đốc</div>
              <div className="italic">(Ký, ghi rõ họ tên)</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A3 landscape; margin: 10mm; }
          html, body { background: #fff !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          nav { display: none !important; }
          body { font-size: 9pt; color: #000; }
          /* Bảng to và rõ */
          table { font-size: 8.5pt !important; border-collapse: collapse; page-break-inside: auto; width: 100%; }
          th, td { border: 1px solid #333 !important; padding: 2px 3px !important; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          /* Mỗi nhóm khoa = 1 trang riêng nếu không vừa */
          .print\\:break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
          .print\\:break-after-page { page-break-after: always; break-after: page; }
          /* Bo góc và shadow → tắt khi in */
          .rounded-xl, .rounded-lg, .rounded-md, .rounded { border-radius: 0 !important; }
          .shadow-sm, .shadow, .shadow-md { box-shadow: none !important; }
          /* Header xanh đậm → ép màu khi in */
          [class*="bg-blue-700"], [class*="bg-amber-500"] {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
          }
          /* Chống cắt sticky */
          .sticky { position: static !important; }
          /* Header bệnh viện in to */
          .print-header-name { font-size: 11pt !important; }
          .print-title { font-size: 16pt !important; font-weight: bold !important; }
          .print-subtitle { font-size: 12pt !important; font-style: italic !important; }
        }
      `}</style>
    </div>
  )
}
