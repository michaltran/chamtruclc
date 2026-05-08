import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DUTY_ORDER = [
  'LANHDAO','CC-HSTC','HL-CC','CC-NGOAI','NGOAI','GMHS','CC-SAN','SAN','NOI','NHI',
  'YHCT','LCK','SAM','CT','XQUANG','XN','VP','LX','HL'
];

/**
 * GET /api/public/schedules?year=&month=
 * Trả lịch trực tháng — public, không cần auth.
 * Chỉ trả schedule có status='approved' (đã khoá).
 */
router.get('/schedules', async (req, res) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year/month không hợp lệ' });
  }
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const schedules = await prisma.schedule.findMany({
    where: {
      shiftDate: { gte: startDate, lte: endDate },
      status: 'approved',
    },
    include: {
      user: { select: { fullName: true, title: true, phone: true } },
      department: { select: { id: true, name: true, code: true } },
      shiftType: { select: { code: true, name: true } },
    },
    // Giữ thứ tự nhập: ai phân ca trước hiện trước trong cùng ô
    orderBy: [{ shiftDate: 'asc' }, { createdAt: 'asc' }],
  });

  // Cũng trả về danh sách khoa (đã sort) để render trên trang public
  const depts = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  });
  depts.sort((a, b) => {
    const ai = DUTY_ORDER.indexOf(a.code), bi = DUTY_ORDER.indexOf(b.code);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  res.json({
    year,
    month,
    schedules,
    departments: depts,
    totalDays: new Date(year, month, 0).getDate(),
  });
});

export default router;
