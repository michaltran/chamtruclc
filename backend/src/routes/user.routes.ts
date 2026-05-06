import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

/** Convert empty strings to undefined so optional zod/Prisma fields don't choke. */
function cleanEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === '' || v === null) continue;
    out[k] = v;
  }
  return out;
}

/**
 * GET /api/users?departmentId=...
 */
router.get('/', authenticate, async (req, res) => {
  const where: any = { isActive: true };

  if (req.user!.role === 'department_lead') {
    where.departmentId = req.user!.departmentId;
  } else if (req.query.departmentId) {
    where.departmentId = req.query.departmentId as string;
  }

  const users = await prisma.user.findMany({
    where,
    include: { department: { select: { id: true, name: true, code: true } } },
    orderBy: { fullName: 'asc' },
  });

  res.json(users.map(({ passwordHash, ...u }) => ({ ...u, canLogin: !!passwordHash })));
});

/**
 * POST /api/users (admin only)
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    fullName: z.string().min(1),
    email: z.string().email().optional(),
    employeeCode: z.string().optional(),
    role: z.enum(['admin', 'department_lead', 'staff']).default('staff'),
    departmentId: z.string().uuid().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
  });

  const parsed = schema.safeParse(cleanEmpty(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { ...rest, passwordHash },
    });
    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Tên đăng nhập, email hoặc mã NV đã tồn tại' });
    }
    throw err;
  }
});

/**
 * PATCH /api/users/:id
 */
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const updateSchema = z.object({
    fullName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    employeeCode: z.string().optional(),
    role: z.enum(['admin', 'department_lead', 'staff']).optional(),
    departmentId: z.string().uuid().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = updateSchema.safeParse(cleanEmpty(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id as string },
      data: parsed.data,
    });
    const { passwordHash: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email hoặc mã NV đã tồn tại' });
    }
    throw err;
  }
});

/**
 * POST /api/users/:id/grant-login (admin only)
 * Cấp quyền đăng nhập: đặt mật khẩu mới + role + đảm bảo isActive=true
 */
router.post('/:id/grant-login', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    password: z.string().min(6),
    role: z.enum(['admin', 'department_lead', 'staff']).default('staff'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const updated = await prisma.user.update({
    where: { id: req.params.id as string },
    data: { passwordHash, role: parsed.data.role, isActive: true },
  });
  const { passwordHash: _, ...safeUser } = updated;
  res.json(safeUser);
});

/**
 * POST /api/users/:id/revoke-login (admin only)
 * Thu hồi quyền đăng nhập: xoá password_hash, role về staff
 */
router.post('/:id/revoke-login', authenticate, authorize('admin'), async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.params.id as string },
    data: { passwordHash: '', role: 'staff' },
  });
  const { passwordHash: _, ...safeUser } = updated;
  res.json(safeUser);
});

/**
 * DELETE /api/users/:id (soft delete)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id as string },
    data: { isActive: false },
  });
  res.json({ success: true });
});

export default router;
