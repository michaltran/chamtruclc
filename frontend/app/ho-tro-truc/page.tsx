'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { scheduleApi, departmentApi, userApi } from '@/lib/api'

// Trang xuất "Hỗ trợ trực" — 3 danh sách:
//  G1: Bác sĩ trực CC-HSTC (khu cấp cứu khu A)
//  G2: ĐD/HS/HL trực CC-HSTC + KB + HL-CC
//  G3: BS trực các khoa còn lại (Ngoại, Sản, Nội, Nhi, CĐHA, ...)

const isDoctorTitle = (title?: string) => {
  if (!title) return false
  const t = title.toLowerCase()
  return t.includes('bác sĩ') || t.includes('lãnh đạo')
    || /tr[ưu]ởng\s*khoa|ph[óo]\s*tr[ưu]ởng\s*khoa|ph[óo]\s*khoa|gi[áa]m\s*đ[ốo]c/.test(t)
}
const isNurseTitle = (title?: string) => {
  if (!title) return false
  const t = title.toLowerCase()
  return /điều dưỡng|hộ sinh|hộ lý|kỹ thuật|kt\.|đd\.|y sĩ|y tá/i.test(t)
}

const PARENT_GROUP: Record<string, string> = {
  'CC-HSTC':  'Khoa Cấp cứu - HSTC',
  'CC-NGOAI': 'Khoa Ngoại',
  'NGOAI':    'Khoa Ngoại',
  'GMHS':     'Khoa Gây mê hồi sức',
  'CC-SAN':   'Khoa Phụ Sản',
  'SAN':      'Khoa Phụ Sản',
  'NOI':      'Khoa Nội',
  'NHI':      'Khoa Nhi',
  'YHCT':     'Khoa YHCT - PHCN',
  'LCK':      'Khoa Liên Chuyên khoa',
  'SAM':      'Khoa CĐHA',
  'CT':       'Khoa CĐHA',
  'XQUANG':   'Khoa CĐHA',
  'XN':       'Khoa Xét nghiệm',
  'VP':       'Phòng Viện phí',
  'LX':       'Lái xe',
  'HL-CC':    'Hộ lý',
  'HL':       'Hộ lý',
  'KB':       'Khoa KB',
  'TN':       'Khoa Truyền nhiễm',
}

type Row = { id: string; fullName: string; homeDept: string; count: number; note?: string }

export default function HoTroTrucPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [schedules, setSchedules] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0,10))
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const u = localStorage.getItem('auth_user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    const allowed = parsed.role === 'admin' || (parsed.pages || []).includes('ho-tro-truc') || (parsed.pages || []).includes('cham-truc')
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
      setDepartments(d)
      setAllUsers(u)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }, [year, month, router])

  useEffect(() => { if (authUser) load() }, [load, authUser])

  // Build 3 groups
  const { g1Bs, g2Dd, g3Bs, total1, total2, total3 } = useMemo(() => {
    const deptById = new Map(departments.map((d: any) => [d.id, d]))
    const userById = new Map(allUsers.map((u: any) => [u.id, u]))

    // Tên khoa "home" của user (primary dept)
    const userHomeDept = (u: any): string => {
      const primary = (u.departments || []).find((dd: any) => dd.isPrimary) || (u.departments || [])[0]
      const code = primary?.code
        || departments.find((d: any) => d.id === u.departmentId)?.code
      if (code && PARENT_GROUP[code]) return PARENT_GROUP[code]
      // fallback
      const dep = u.departments?.[0] || departments.find((d:any) => d.id === u.departmentId)
      return dep?.name || ''
    }

    // Đếm số công của user theo điều kiện filter dept code
    const countByUser = (filter: (deptCode: string) => boolean) => {
      const cnt: Record<string, number> = {}
      const seen: Record<string, Set<string>> = {} // dedupe 1 user 1 ngày
      for (const s of schedules) {
        const dept = deptById.get(s.departmentId) as any
        if (!dept || !filter(dept.code)) continue
        const day = new Date(s.shiftDate).toDateString()
        if (!seen[s.userId]) seen[s.userId] = new Set()
        const key = `${day}-${dept.code}`
        if (seen[s.userId].has(key)) continue
        seen[s.userId].add(key)
        cnt[s.userId] = (cnt[s.userId] || 0) + 1
      }
      return cnt
    }

    // G1: BS trực ở CC-HSTC
    const g1 = countByUser(c => c === 'CC-HSTC')
    // G2: ĐD/HS/HL trực ở CC-HSTC, HL-CC, KB
    const g2 = countByUser(c => c === 'CC-HSTC' || c === 'HL-CC' || c === 'KB')
    // G3: BS trực ở các khoa khác (không CC-HSTC, không HL/HL-CC, không LANHDAO, không LX, không VP)
    const excludeG3 = new Set(['CC-HSTC','HL-CC','HL','LANHDAO','LX','VP'])
    const g3 = countByUser(c => !excludeG3.has(c))

    const buildRows = (cnt: Record<string, number>, isBs: boolean): Row[] => {
      const rows: Row[] = []
      for (const [uid, c] of Object.entries(cnt)) {
        const u = userById.get(uid) as any
        if (!u) continue
        if (isBs && !isDoctorTitle(u.title)) continue
        if (!isBs && !isNurseTitle(u.title)) continue
        rows.push({ id: uid, fullName: u.fullName, homeDept: userHomeDept(u), count: c })
      }
      // Sort theo: tên khoa, rồi tên
      rows.sort((a, b) => {
        const ad = a.homeDept.localeCompare(b.homeDept, 'vi')
        if (ad !== 0) return ad
        return a.fullName.localeCompare(b.fullName, 'vi')
      })
      return rows
    }

    const g1Rows = buildRows(g1, true)
    const g2Rows = buildRows(g2, false)
    const g3Rows = buildRows(g3, true)

    return {
      g1Bs: g1Rows, g2Dd: g2Rows, g3Bs: g3Rows,
      total1: g1Rows.reduce((s, r) => s + r.count, 0),
      total2: g2Rows.reduce((s, r) => s + r.count, 0),
      total3: g3Rows.reduce((s, r) => s + r.count, 0),
    }
  }, [schedules, departments, allUsers])

  // ====================== EXPORT WORD ======================
  const handleExportWord = async () => {
    setExporting(true)
    try {
      const docx: any = await import('docx')
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageOrientation, VerticalAlign,
      } = docx

      const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      const borders = { top: border, bottom: border, left: border, right: border }

      const cell = (text: string, opts: any = {}) => new TableCell({
        borders,
        width: opts.width,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        verticalAlign: VerticalAlign.CENTER,
        shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
        children: [new Paragraph({
          alignment: opts.align || AlignmentType.LEFT,
          children: [new TextRun({ text, bold: !!opts.bold, size: opts.size || 22 })],
        })],
      })

      const buildTitle = (title: string) => [
        // Header 2 cột bệnh viện (tab stops)
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: 'TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU', bold: true, size: 22 }),
          new TextRun({ text: '\t\t\t\t' }),
          new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 22 }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: 'PHÒNG KẾ HOẠCH NGHIỆP VỤ', bold: true, size: 22 }),
          new TextRun({ text: '\t\t\t\t\t' }),
          new TextRun({ text: 'Độc lập – Tự do – Hạnh phúc', italics: true, size: 22 }),
        ]}),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 200 }, children: [
          new TextRun({ text: `Hòa Khánh, ngày ${signDate.slice(8,10)} tháng ${signDate.slice(5,7)} năm ${signDate.slice(0,4)}`, italics: true, size: 22 }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300, after: 100 }, children: [
          new TextRun({ text: 'DANH SÁCH', bold: true, size: 28 }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: title, bold: true, size: 26 }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [
          new TextRun({ text: `Tháng ${month} năm ${year}`, italics: true, size: 24 }),
        ]}),
      ]

      const buildTable = (rows: Row[], totalCount: number) => {
        const W = { stt: 800, name: 4500, dept: 3500, count: 1500, note: 2000 }
        const headerCells = [
          cell('STT',           { width: { size: W.stt,   type: WidthType.DXA }, bold: true, align: AlignmentType.CENTER, fill: 'D9E1F2' }),
          cell('HỌ VÀ TÊN',     { width: { size: W.name,  type: WidthType.DXA }, bold: true, align: AlignmentType.CENTER, fill: 'D9E1F2' }),
          cell('KHOA/ PHÒNG',   { width: { size: W.dept,  type: WidthType.DXA }, bold: true, align: AlignmentType.CENTER, fill: 'D9E1F2' }),
          cell('SỐ CÔNG TRỰC',  { width: { size: W.count, type: WidthType.DXA }, bold: true, align: AlignmentType.CENTER, fill: 'D9E1F2' }),
          cell('GHI CHÚ',       { width: { size: W.note,  type: WidthType.DXA }, bold: true, align: AlignmentType.CENTER, fill: 'D9E1F2' }),
        ]
        const tableRows: any[] = [new TableRow({ tableHeader: true, children: headerCells })]
        rows.forEach((r, i) => {
          tableRows.push(new TableRow({ children: [
            cell(String(i + 1),   { width: { size: W.stt,   type: WidthType.DXA }, align: AlignmentType.CENTER }),
            cell(r.fullName,      { width: { size: W.name,  type: WidthType.DXA } }),
            cell(r.homeDept,      { width: { size: W.dept,  type: WidthType.DXA } }),
            cell(String(r.count), { width: { size: W.count, type: WidthType.DXA }, align: AlignmentType.CENTER, bold: true }),
            cell(r.note || '',    { width: { size: W.note,  type: WidthType.DXA } }),
          ]}))
        })
        // Tổng cộng row
        tableRows.push(new TableRow({ children: [
          new TableCell({ borders, columnSpan: 3,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Tổng cộng:', bold: true, size: 24 })] })],
          }),
          cell(String(totalCount), { width: { size: W.count, type: WidthType.DXA }, align: AlignmentType.CENTER, bold: true, size: 24, fill: 'F2F2F2' }),
          cell('',                 { width: { size: W.note,  type: WidthType.DXA }, fill: 'F2F2F2' }),
        ]}))
        return new Table({
          width: { size: W.stt + W.name + W.dept + W.count + W.note, type: WidthType.DXA },
          columnWidths: [W.stt, W.name, W.dept, W.count, W.note],
          rows: tableRows,
        })
      }

      const buildSignatures = () => {
        const cellW = 4000
        const c = (lines: string[]) => new TableCell({
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } as any,
          width: { size: cellW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: lines.map((l, idx) => new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: l, bold: idx === 0, italics: idx === 1, size: 22 })] })),
        })
        return new Table({
          width: { size: cellW * 4, type: WidthType.DXA },
          columnWidths: [cellW, cellW, cellW, cellW],
          rows: [
            new TableRow({ children: [
              c(['NGƯỜI CHẤM CÔNG', '', '', '', '', '', 'Văn Thị Trường Giang']),
              c(['P. KHNV',         '', '', '', '', '', 'Bùi Tiến']),
              c(['P. TCHC',         '', '', '', '', '', 'Huỳnh Bá Dũng']),
              c(['GIÁM ĐỐC',        '', '', '', '', '', 'Nguyễn Thành Tân']),
            ]}),
          ],
        })
      }

      const sectionsContent = [
        ...buildTitle('Bác sĩ trực cấp cứu tại khu cấp cứu (khu A) và khoa Cấp cứu – HSTC được phụ cấp'),
        buildTable(g1Bs, total1),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        buildSignatures(),
      ]
      const sectionsContent2 = [
        ...buildTitle('Điều dưỡng, hộ lý trực cấp cứu tại khu cấp cứu (khu A) và khoa Cấp cứu – HSTC được phụ cấp'),
        buildTable(g2Dd, total2),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        buildSignatures(),
      ]
      const sectionsContent3 = [
        ...buildTitle('Bác sĩ tham gia trực các khoa còn lại được phụ cấp'),
        buildTable(g3Bs, total3),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        buildSignatures(),
      ]

      const pageOpts = {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT }, // A4 portrait
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      }
      const doc = new Document({
        creator: 'TTYT KV Liên Chiểu',
        styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
        sections: [
          { properties: pageOpts, children: sectionsContent },
          { properties: pageOpts, children: sectionsContent2 },
          { properties: pageOpts, children: sectionsContent3 },
        ],
      })

      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ho-tro-truc-${month}-${year}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('[Word export]', err)
      alert('Lỗi xuất Word: ' + (err?.message || err))
    } finally {
      setExporting(false)
    }
  }

  // ====================== EXPORT PDF ======================
  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')
      const node = document.getElementById('htt-export-area')
      if (!node) return

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const PAGE_W = 210, PAGE_H = 297
      const MARGIN = 15
      const CONTENT_W = PAGE_W - 2 * MARGIN
      const CONTENT_H = PAGE_H - 2 * MARGIN

      // Capture each section separately — set font Times New Roman trên export area
      const prevFont = node.style.fontFamily
      node.style.fontFamily = '"Times New Roman", Times, serif'

      const sections = node.querySelectorAll('.htt-section')
      let pageIdx = 0
      for (const sec of Array.from(sections)) {
        const canvas = await html2canvas(sec as HTMLElement, {
          scale: 2,
          backgroundColor: '#ffffff',
          windowWidth: 1200,
        })
        if (pageIdx > 0) pdf.addPage()
        pageIdx++
        const ratio = canvas.width / canvas.height
        let drawW = CONTENT_W
        let drawH = drawW / ratio
        if (drawH > CONTENT_H) {
          drawH = CONTENT_H
          drawW = drawH * ratio
        }
        const offsetX = MARGIN + (CONTENT_W - drawW) / 2
        const offsetY = MARGIN
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
          offsetX, offsetY, drawW, drawH, undefined, 'FAST')
      }

      // Khôi phục font
      node.style.fontFamily = prevFont
      pdf.save(`ho-tro-truc-${month}-${year}.pdf`)
    } catch (err: any) {
      console.error('[PDF export]', err)
      alert('Lỗi xuất PDF: ' + (err?.message || err))
    } finally {
      setExporting(false)
    }
  }

  if (!authUser) return null

  // ============ Render ============
  const renderSection = (
    title: string, rows: Row[], total: number, key: string,
  ) => (
    <div key={key} className="htt-section bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-6 print:shadow-none print:rounded-none print:break-after-page">
      {/* Header */}
      <div className="grid grid-cols-2 gap-3 text-[11pt]">
        <div className="text-center uppercase">
          <div>TRUNG TÂM Y TẾ KHU VỰC LIÊN CHIỂU</div>
          <div className="font-bold">PHÒNG KẾ HOẠCH NGHIỆP VỤ</div>
        </div>
        <div className="text-center">
          <div className="uppercase font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div className="italic">Độc lập – Tự do – Hạnh phúc</div>
        </div>
      </div>
      <div className="text-right italic mt-3 text-sm">
        Hòa Khánh, ngày {signDate.slice(8,10)} tháng {signDate.slice(5,7)} năm {signDate.slice(0,4)}
      </div>
      <div className="text-center mt-4">
        <div className="text-xl font-bold uppercase">DANH SÁCH</div>
        <div className="text-base font-semibold mt-1">{title}</div>
        <div className="italic mt-1">Tháng {month} năm {year}</div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse mt-4 text-sm">
        <thead>
          <tr className="bg-blue-50">
            <th className="border border-gray-700 px-2 py-2 w-12 font-bold">STT</th>
            <th className="border border-gray-700 px-2 py-2 font-bold">HỌ VÀ TÊN</th>
            <th className="border border-gray-700 px-2 py-2 font-bold">KHOA/PHÒNG</th>
            <th className="border border-gray-700 px-2 py-2 w-24 font-bold">SỐ CÔNG TRỰC</th>
            <th className="border border-gray-700 px-2 py-2 w-32 font-bold">GHI CHÚ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="border border-gray-700 px-2 py-3 text-center text-gray-400 italic">
              Không có dữ liệu
            </td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="border border-gray-700 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border border-gray-700 px-2 py-1.5">{r.fullName}</td>
              <td className="border border-gray-700 px-2 py-1.5">{r.homeDept}</td>
              <td className="border border-gray-700 px-2 py-1.5 text-center font-semibold">{r.count}</td>
              <td className="border border-gray-700 px-2 py-1.5">{r.note || ''}</td>
            </tr>
          ))}
          <tr className="bg-gray-100">
            <td colSpan={3} className="border border-gray-700 px-2 py-2 text-right font-bold">Tổng cộng:</td>
            <td className="border border-gray-700 px-2 py-2 text-center font-bold">{total}</td>
            <td className="border border-gray-700 px-2 py-2"></td>
          </tr>
        </tbody>
      </table>

      {/* Signatures */}
      <div className="grid grid-cols-4 gap-2 mt-10 text-center text-xs">
        {[
          ['NGƯỜI CHẤM CÔNG', 'Văn Thị Trường Giang'],
          ['P. KHNV', 'Bùi Tiến'],
          ['P. TCHC', 'Huỳnh Bá Dũng'],
          ['GIÁM ĐỐC', 'Nguyễn Thành Tân'],
        ].map(([role, name]) => (
          <div key={role}>
            <div className="font-bold uppercase">{role}</div>
            <div className="italic text-gray-500">(Ký, ghi rõ họ tên)</div>
            <div className="h-12"></div>
            <div className="font-semibold">{name}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <Navbar />
      <div className="max-w-[1100px] mx-auto px-4 py-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
          <h1 className="text-xl font-bold text-gray-800">Hỗ trợ trực — danh sách phụ cấp</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select value={month} onChange={e=>setMonth(+e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-base font-medium">
              {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select value={year} onChange={e=>setYear(+e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-base font-medium">
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <label className="text-sm text-gray-600 ml-2">Ngày ký:</label>
            <input type="date" value={signDate} onChange={e=>setSignDate(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm"/>
            <button onClick={handleExportWord} disabled={exporting}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              📝 Xuất Word
            </button>
            <button onClick={handleExportPDF} disabled={exporting}
              className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              📄 Xuất PDF
            </button>
            <button onClick={()=>window.print()}
              className="bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-800">
              🖨️ In
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>
        ) : (
          <div id="htt-export-area">
            {renderSection('Bác sĩ trực cấp cứu tại khu cấp cứu (khu A) và khoa Cấp cứu – HSTC được phụ cấp', g1Bs, total1, 'g1')}
            {renderSection('Điều dưỡng, hộ lý trực cấp cứu tại khu cấp cứu (khu A) và khoa Cấp cứu – HSTC được phụ cấp', g2Dd, total2, 'g2')}
            {renderSection('Bác sĩ tham gia trực các khoa còn lại được phụ cấp', g3Bs, total3, 'g3')}
          </div>
        )}
      </div>
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { background: #fff !important; }
          .print\\:hidden { display: none !important; }
          nav { display: none !important; }
          .print\\:break-after-page { break-after: page; page-break-after: always; }
          table { font-size: 10pt; }
          th, td { border: 1px solid #000 !important; }
        }
      `}</style>
    </div>
  )
}
