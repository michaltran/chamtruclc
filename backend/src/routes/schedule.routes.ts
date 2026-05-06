import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize, checkDepartmentAccess } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const createScheduleSchema = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid(),
  shiftTypeId: z.string().uuid().optional(),
  shiftDate: z.string(),
  note: z.string().optional(),
});

// Khoa cấp cứu (cho ca TC/CC/LC)
const EMERGENCY_DEPT_CODES = new Set(['CC-HSTC','HL-CC','CC-NGOAI','CC-SAN']);
// Khoa hồi sức / hồi tỉnh (cho ca THS/CHS/LHS)
const RECOVERY_DEPT_CODES = new Set(['GMHS']);

/**
 * Pick shift type smartly based on (date, departmentCode):
 *   normal/weekday=T  weekend=C  holiday=L
 *   emergency/weekday=TC weekend=CC holiday=LC
 *   recovery/weekday=THS weekend=CHS holiday=LHS
 */
async function getDefaultShiftTypeForDate(prisma: PrismaClient, date: Date, departmentCode?: string) {
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isHoliday = await prisma.holiday.findUnique({ where: { holidayDate: dateOnly } });
  const isWeekend = [0, 6].includes(date.getDay());
  const isEmerg = !!departmentCode && EMERGENCY_DEPT_CODES.has(departmentCode);
  const isRecov = !!departmentCode && RECOVERY_DEPT_CODES.has(departmentCode);

  let code: string = 'T';
  if (isRecov) code = isHoliday ? 'LHS' : isWeekend ? 'CHS' : 'THS';
  else if (isEmerg) code = isHoliday ? 'LC' : isWeekend ? 'CC' : 'TC';
  else code = isHoliday ? 'L' : isWeekend ? 'C' : 'T';

  let st = await prisma.shiftType.findFirst({ where: { code } });
  if (!st) {
    st = await prisma.shiftType.findFirst({ where: { code: 'T' } });
  }
  if (!st) {
    st = await prisma.shiftType.create({
      data: {
        code: 'T',
        name: 'Trực bình thường trong tuần 24/24',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-02T07:00:00Z'),
        durationHours: 24,
        baseAmount: 0,
        weekendCoef: 1.0,
        holidayCoef: 1.0,
        color: '#3B82F6',
        isActive: true,
      },
    });
  }
  return st;
}

// keep backward compat for places that called the old function name
async function getDefaultShiftType(prisma: PrismaClient) {
  return getDefaultShiftTypeForDate(prisma, new Date());
}

/**
 * GET /api/schedules?year=2026&month=5&departmentId=...
 * Lấy lịch trực theo tháng
 */
/**
 * GET /api/schedules/shift-types
 */
router.get('/shift-types', authenticate, async (_req, res) => {
  const types = await prisma.shiftType.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });
  // Order: T, C, L, TC, CC, LC, THS, CHS, LHS
  const order = ['T','C','L','TC','CC','LC','THS','CHS','LHS'];
  types.sort((a, b) => {
    const ai = order.indexOf(a.code), bi = order.indexOf(b.code);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.code.localeCompare(b.code);
  });
  res.json(types);
});

router.get('/', authenticate, async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const departmentId = req.query.departmentId as string | undefined;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Department lead chỉ xem khoa mình; admin xem tất cả
  const where: any = {
    shiftDate: { gte: startDate, lte: endDate },
  };

  if (req.user!.role === 'department_lead') {
    where.departmentId = req.user!.departmentId;
  } else if (departmentId) {
    where.departmentId = departmentId;
  }

  if (req.user!.role === 'staff') {
    where.userId = req.user!.id;
  }

  const schedules = await prisma.schedule.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, employeeCode: true, title: true } },
      department: { select: { id: true, name: true, code: true } },
      shiftType: true,
    },
    orderBy: [{ shiftDate: 'asc' }, { shiftType: { startTime: 'asc' } }],
  });

  res.json(schedules);
});

/**
 * POST /api/schedules
 * Tạo lịch trực mới (admin hoặc department_lead)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'department_lead'),
  async (req, res) => {
    const parsed = createScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    const data = parsed.data;

    // Department lead chỉ tạo lịch cho khoa mình
    if (!checkDepartmentAccess(req, data.departmentId)) {
      return res.status(403).json({ error: 'Không có quyền tạo lịch cho khoa này' });
    }

    // Lock: dept_lead cannot add new schedules to a month already submitted
    if (req.user!.role === 'department_lead') {
      const d = new Date(data.shiftDate);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const lockedExists = await prisma.schedule.findFirst({
        where: {
          departmentId: data.departmentId,
          shiftDate: { gte: monthStart, lte: monthEnd },
          status: { in: ['submitted', 'approved'] },
        },
      });
      if (lockedExists) {
        return res.status(403).json({ error: 'Lịch tháng này đã nộp/duyệt — liên hệ admin để chỉnh sửa' });
      }
    }

    try {
      // Determine shift code from (date, dept code) — auto-pick T/C/L/TC/CC/LC/THS/CHS/LHS
      const dept = await prisma.department.findUnique({
        where: { id: data.departmentId },
        select: { code: true },
      });
      const shiftTypeId = data.shiftTypeId
        || (await getDefaultShiftTypeForDate(prisma, new Date(data.shiftDate), dept?.code)).id;
      const schedule = await prisma.schedule.create({
        data: {
          userId: data.userId,
          departmentId: data.departmentId,
          shiftTypeId,
          shiftDate: new Date(data.shiftDate),
          note: data.note,
          isWeekend: [0, 6].includes(new Date(data.shiftDate).getDay()),
          createdById: req.user!.id,
          status: 'draft',
        },
        include: { user: true, shiftType: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'CREATE',
          entityType: 'schedule',
          entityId: schedule.id,
          newData: schedule as any,
        },
      });

      res.status(201).json(schedule);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({
          error: 'Người này đã có ca trực cùng loại trong ngày này',
        });
      }
      throw err;
    }
  }
);

/**
 * POST /api/schedules/bulk
 * Tạo lịch trực hàng loạt (cho cả tuần/tháng)
 */
router.post(
  '/bulk',
  authenticate,
  authorize('admin', 'department_lead'),
  async (req, res) => {
    const schema = z.object({
      schedules: z.array(createScheduleSchema),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    const created = [];
    const skipped = [];

    for (const item of parsed.data.schedules) {
      if (!checkDepartmentAccess(req, item.departmentId)) {
        skipped.push({ ...item, reason: 'Không có quyền' });
        continue;
      }
      try {
        const itemDept = await prisma.department.findUnique({
          where: { id: item.departmentId },
          select: { code: true },
        });
        const shiftTypeId = item.shiftTypeId
          || (await getDefaultShiftTypeForDate(prisma, new Date(item.shiftDate), itemDept?.code)).id;
        const s = await prisma.schedule.create({
          data: {
            userId: item.userId,
            departmentId: item.departmentId,
            shiftTypeId,
            shiftDate: new Date(item.shiftDate),
            isWeekend: [0, 6].includes(new Date(item.shiftDate).getDay()),
            createdById: req.user!.id,
            note: item.note,
          },
        });
        created.push(s);
      } catch (err: any) {
        skipped.push({ ...item, reason: err.code === 'P2002' ? 'Trùng ca' : 'Lỗi' });
      }
    }

    res.json({ created: created.length, skipped: skipped.length, details: { skipped } });
  }
);

/**
 * PATCH /api/schedules/:id
 * Cập nhật lịch trực
 */
router.patch(
  '/:id',
  authenticate,
  authorize('admin', 'department_lead'),
  async (req, res) => {
    const id = req.params.id as string;
    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!checkDepartmentAccess(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    if (existing.status !== 'draft' && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Lịch đã nộp/duyệt — chỉ admin mới sửa được' });
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE',
        entityType: 'schedule',
        entityId: id,
        oldData: existing as any,
        newData: updated as any,
      },
    });

    res.json(updated);
  }
);

/**
 * DELETE /api/schedules/:id
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'department_lead'),
  async (req, res) => {
    const id = req.params.id as string;
    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!checkDepartmentAccess(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    if (existing.status !== 'draft' && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Lịch đã nộp/duyệt — chỉ admin mới xoá được' });
    }

    await prisma.schedule.delete({ where: { id } });
    res.json({ success: true });
  }
);

/**
 * POST /api/schedules/:id/approve
 * Duyệt lịch (chỉ admin)
 */
router.post('/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  const id = req.params.id as string;
  const updated = await prisma.schedule.update({
    where: { id },
    data: {
      status: 'approved',
      approvedById: req.user!.id,
      approvedAt: new Date(),
    },
  });

  await prisma.approval.create({
    data: {
      scheduleId: id,
      actorId: req.user!.id,
      action: 'approve',
      comment: req.body.comment,
    },
  });

  res.json(updated);
});

/**
 * POST /api/schedules/submit-month
 * Đại diện khoa nộp lịch cuối tháng để admin duyệt
 */
router.post(
  '/submit-month',
  authenticate,
  authorize('department_lead'),
  async (req, res) => {
    const { year, month } = req.body;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const result = await prisma.schedule.updateMany({
      where: {
        departmentId: req.user!.departmentId!,
        shiftDate: { gte: startDate, lte: endDate },
        status: 'draft',
      },
      data: { status: 'submitted' },
    });

    res.json({ submitted: result.count });
  }
);

/**
 * GET /api/schedules/lock-status?year=&month=&departmentId=
 * Returns whether a (dept,month) is locked (submitted/approved)
 */
router.get('/lock-status', authenticate, async (req, res) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const where: any = {
    shiftDate: { gte: startDate, lte: endDate },
    status: { in: ['submitted', 'approved'] },
  };
  if (req.query.departmentId) where.departmentId = req.query.departmentId as string;
  else if (req.user!.role === 'department_lead') where.departmentId = req.user!.departmentId!;

  const counts = await prisma.schedule.groupBy({
    by: ['departmentId', 'status'],
    where,
    _count: true,
  });
  res.json(counts);
});

/**
 * POST /api/schedules/duplicate-from
 * Body: { fromYear, fromMonth, toYear, toMonth, departmentId? }
 * Tự tạo lịch tháng mới bằng cách sao chép cấu trúc tháng trước (cùng vị trí khoa, cùng người, ngày dịch chuyển theo tuần).
 */
router.post(
  '/duplicate-from',
  authenticate,
  authorize('admin', 'department_lead'),
  async (req, res) => {
    const schema = z.object({
      fromYear: z.number(),
      fromMonth: z.number().min(1).max(12),
      toYear: z.number(),
      toMonth: z.number().min(1).max(12),
      departmentId: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const { fromYear, fromMonth, toYear, toMonth, departmentId } = parsed.data;

    const where: any = {
      shiftDate: {
        gte: new Date(fromYear, fromMonth - 1, 1),
        lte: new Date(fromYear, fromMonth, 0, 23, 59, 59),
      },
    };
    if (req.user!.role === 'department_lead') where.departmentId = req.user!.departmentId!;
    else if (departmentId) where.departmentId = departmentId;

    const sourceList = await prisma.schedule.findMany({ where });

    // Map: source day -> new date in target month (cap at last day of target month)
    const targetDaysInMonth = new Date(toYear, toMonth, 0).getDate();
    const defaultShift = await getDefaultShiftType(prisma);

    let created = 0;
    let skipped = 0;
    for (const s of sourceList) {
      const srcDay = new Date(s.shiftDate).getDate();
      const tgtDay = Math.min(srcDay, targetDaysInMonth);
      const newDate = new Date(toYear, toMonth - 1, tgtDay);
      try {
        await prisma.schedule.create({
          data: {
            userId: s.userId,
            departmentId: s.departmentId,
            shiftTypeId: s.shiftTypeId || defaultShift.id,
            shiftDate: newDate,
            isWeekend: [0, 6].includes(newDate.getDay()),
            createdById: req.user!.id,
            status: 'draft',
            note: s.note,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    res.json({ created, skipped, total: sourceList.length });
  }
);

export default router;
