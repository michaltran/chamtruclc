import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize, checkDepartmentAccess } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const createScheduleSchema = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid(),
  shiftTypeId: z.string().uuid(),
  shiftDate: z.string(),
  note: z.string().optional(),
});

/**
 * GET /api/schedules?year=2026&month=5&departmentId=...
 * Lấy lịch trực theo tháng
 */
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

    try {
      const schedule = await prisma.schedule.create({
        data: {
          userId: data.userId,
          departmentId: data.departmentId,
          shiftTypeId: data.shiftTypeId,
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
        const s = await prisma.schedule.create({
          data: {
            userId: item.userId,
            departmentId: item.departmentId,
            shiftTypeId: item.shiftTypeId,
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
    const { id } = req.params;
    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!checkDepartmentAccess(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    if (existing.status === 'approved' && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Lịch đã duyệt, chỉ admin mới sửa được' });
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
    const { id } = req.params;
    const existing = await prisma.schedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

    if (!checkDepartmentAccess(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    if (existing.status === 'approved' && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Lịch đã duyệt không thể xóa' });
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
  const { id } = req.params;
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

export default router;
