import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Khoa cấp cứu / hồi sức (đồng bộ với schedule.routes.ts)
const EMERGENCY_DEPT_CODES = new Set(['CC-HSTC','HL-CC','CC-NGOAI','CC-SAN']);
const RECOVERY_DEPT_CODES  = new Set(['GMHS']);

/**
 * Re-apply shift_type cho mọi schedules vào 1 ngày cụ thể.
 * Tính toán mã ca đúng dựa trên: ngày lễ hay không + dept code.
 * Trả về số ca đã cập nhật.
 */
async function reapplyForDate(targetDate: Date): Promise<number> {
  // Tạo range full ngày
  const dStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const dEnd   = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  const isHoliday = !!(await prisma.holiday.findUnique({ where: { holidayDate: dStart } }));
  const isWeekend = [0, 6].includes(dStart.getDay());

  // Cache shift_types
  const shiftTypes = await prisma.shiftType.findMany();
  const stByCode: Record<string, string> = {};
  shiftTypes.forEach(st => { stByCode[st.code] = st.id; });

  const schedules = await prisma.schedule.findMany({
    where: { shiftDate: { gte: dStart, lte: dEnd } },
    include: { department: { select: { code: true } } },
  });

  let updated = 0;
  for (const s of schedules) {
    const code = s.department.code;
    const isEmerg = EMERGENCY_DEPT_CODES.has(code);
    const isRecov = RECOVERY_DEPT_CODES.has(code);

    let target: string;
    if (isRecov) target = isHoliday ? 'LHS' : isWeekend ? 'CHS' : 'THS';
    else if (isEmerg) target = isHoliday ? 'LC' : isWeekend ? 'CC' : 'TC';
    else target = isHoliday ? 'L' : isWeekend ? 'C' : 'T';

    const newStId = stByCode[target];
    if (newStId && newStId !== s.shiftTypeId) {
      try {
        await prisma.schedule.update({
          where: { id: s.id },
          data: { shiftTypeId: newStId },
        });
        updated++;
      } catch {
        // skip nếu vi phạm unique constraint
      }
    }
  }
  return updated;
}

/**
 * GET /api/holidays?year=2026
 * List ngày lễ — public (đã authenticate). Filter theo năm nếu có.
 */
router.get('/', authenticate, async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year as string) : null;
  const where: any = {};
  if (year) {
    where.holidayDate = {
      gte: new Date(year, 0, 1),
      lt: new Date(year + 1, 0, 1),
    };
  }
  const list = await prisma.holiday.findMany({
    where,
    orderBy: { holidayDate: 'asc' },
  });
  res.json(list);
});

/**
 * POST /api/holidays — admin only
 * Body: { holidayDate: 'YYYY-MM-DD', name: '...', isPaid?: boolean }
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    holidayDate: z.string(),
    name: z.string().min(1).max(150),
    isPaid: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  try {
    const h = await prisma.holiday.create({
      data: {
        holidayDate: new Date(parsed.data.holidayDate),
        name: parsed.data.name,
        isPaid: parsed.data.isPaid ?? true,
      },
    });
    // Auto re-apply mã ca cho các schedules ở ngày này (T/C → L/LC/LHS)
    const updated = await reapplyForDate(new Date(parsed.data.holidayDate));
    res.status(201).json({ ...h, autoUpdated: updated });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ngày lễ này đã tồn tại' });
    }
    throw err;
  }
});

/**
 * PATCH /api/holidays/:id — admin
 */
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    holidayDate: z.string().optional(),
    name: z.string().min(1).max(150).optional(),
    isPaid: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  const data: any = {};
  if (parsed.data.holidayDate) data.holidayDate = new Date(parsed.data.holidayDate);
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;

  try {
    // Lấy ngày cũ TRƯỚC khi update (để reapply ngày cũ nếu ngày bị đổi)
    const old = await prisma.holiday.findUnique({ where: { id: req.params.id as string } });
    const h = await prisma.holiday.update({
      where: { id: req.params.id as string },
      data,
    });
    // Reapply ngày mới (chuyển → L) và ngày cũ nếu khác (chuyển → T/C lại)
    let updated = 0;
    updated += await reapplyForDate(new Date(h.holidayDate));
    if (old && new Date(old.holidayDate).getTime() !== new Date(h.holidayDate).getTime()) {
      updated += await reapplyForDate(new Date(old.holidayDate));
    }
    res.json({ ...h, autoUpdated: updated });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ngày lễ này đã tồn tại' });
    throw err;
  }
});

/**
 * DELETE /api/holidays/:id — admin
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  // Lấy ngày trước khi xoá để reapply (chuyển L → T/C)
  const h = await prisma.holiday.findUnique({ where: { id: req.params.id as string } });
  await prisma.holiday.delete({ where: { id: req.params.id as string } });
  let updated = 0;
  if (h) updated = await reapplyForDate(new Date(h.holidayDate));
  res.json({ success: true, autoUpdated: updated });
});

/**
 * POST /api/holidays/reapply
 * Body: { year, month }
 * Re-pick shift_type cho TẤT CẢ schedules trong tháng (T/C/L theo ngày + dept code).
 * Dùng sau khi thêm/sửa ngày lễ — schedules cũ sẽ được cập nhật lại.
 * Lưu ý: chỉ chạy cho schedules ở status 'draft'/'submitted'/'approved'.
 */
router.post('/reapply', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    year: z.number(),
    month: z.number().min(1).max(12),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
  const { year, month } = parsed.data;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Cache shift_type by code
  const shiftTypes = await prisma.shiftType.findMany();
  const stByCode: Record<string, string> = {};
  shiftTypes.forEach(st => { stByCode[st.code] = st.id; });

  // Cache holiday dates trong tháng
  const holidaysList = await prisma.holiday.findMany({
    where: { holidayDate: { gte: startDate, lte: endDate } },
  });
  const holidaySet = new Set(holidaysList.map(h => {
    const d = new Date(h.holidayDate);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));

  // Lấy tất cả schedules + dept code
  const schedules = await prisma.schedule.findMany({
    where: { shiftDate: { gte: startDate, lte: endDate } },
    include: { department: { select: { code: true } } },
  });

  let updated = 0;
  for (const s of schedules) {
    const d = new Date(s.shiftDate);
    const isHoliday = holidaySet.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    const isWeekend = [0, 6].includes(d.getDay());
    const code = s.department.code;
    const isEmerg = EMERGENCY_DEPT_CODES.has(code);
    const isRecov = RECOVERY_DEPT_CODES.has(code);

    let target: string;
    if (isRecov) target = isHoliday ? 'LHS' : isWeekend ? 'CHS' : 'THS';
    else if (isEmerg) target = isHoliday ? 'LC' : isWeekend ? 'CC' : 'TC';
    else target = isHoliday ? 'L' : isWeekend ? 'C' : 'T';

    const newStId = stByCode[target];
    if (newStId && newStId !== s.shiftTypeId) {
      // Tránh vi phạm unique constraint (user_id, shift_date, shift_type_id, department_id)
      try {
        await prisma.schedule.update({
          where: { id: s.id },
          data: { shiftTypeId: newStId },
        });
        updated++;
      } catch {
        // skip nếu conflict
      }
    }
  }

  res.json({ updated, total: schedules.length });
});

export default router;
