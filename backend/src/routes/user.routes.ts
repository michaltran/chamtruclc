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

  // Đính kèm permissions theo từng user
  const perms = await prisma.userPermission.findMany({
    where: { userId: { in: users.map(u => u.id) } },
  });
  const permsByUser: Record<string, string[]> = {};
  perms.forEach(p => {
    permsByUser[p.userId] = (p.pages as string[]) || [];
  });

  res.json(users.map(({ passwordHash, ...u }) => ({
    ...u,
    canLogin: !!passwordHash,
    pages: permsByUser[u.id] || [],
  })));
});

const ALL_PAGES = ['schedules','swaps','cham-truc','users','departments'] as const;

/**
 * PUT /api/users/:id/permissions (admin only)
 * Body: { pages: string[] }
 */
router.put('/:id/permissions', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    pages: z.array(z.enum(ALL_PAGES)),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  await prisma.userPermission.upsert({
    where: { userId: req.params.id as string },
    create: { userId: req.params.id as string, pages: parsed.data.pages },
    update: { pages: parsed.data.pages },
  });
  res.json({ success: true, pages: parsed.data.pages });
});

/**
 * POST /api/users/import (admin only)
 * Body: { users: [{ username, fullName, employeeCode?, departmentCode?, title?, phone?, email?, role? }] }
 * Tạo nhân viên hàng loạt — không cấp login (admin sẽ cấp sau).
 */
router.post('/import', authenticate, authorize('admin'), async (req, res) => {
  const itemSchema = z.object({
    username: z.string().min(2),
    fullName: z.string().min(1),
    employeeCode: z.string().optional(),
    departmentCode: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin','department_lead','staff']).default('staff'),
  });
  const schema = z.object({ users: z.array(itemSchema).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  // Map dept codes to ids in 1 query
  const deptCodes = [...new Set(parsed.data.users.map(u => u.departmentCode).filter(Boolean) as string[])];
  const depts = await prisma.department.findMany({ where: { code: { in: deptCodes } } });
  const deptMap: Record<string, string> = {};
  depts.forEach(d => { deptMap[d.code] = d.id; });

  const created: any[] = [];
  const skipped: { username: string; reason: string }[] = [];

  for (const item of parsed.data.users) {
    try {
      const cleaned = cleanEmpty(item);
      const data: any = {
        username: cleaned.username,
        fullName: cleaned.fullName,
        employeeCode: cleaned.employeeCode,
        title: cleaned.title,
        phone: cleaned.phone,
        email: cleaned.email,
        role: cleaned.role || 'staff',
        passwordHash: '', // chưa cấp login
      };
      if (item.departmentCode && deptMap[item.departmentCode]) {
        data.departmentId = deptMap[item.departmentCode];
      } else if (item.departmentCode) {
        skipped.push({ username: item.username, reason: `Khoa "${item.departmentCode}" không tồn tại` });
        continue;
      }
      const u = await prisma.user.create({ data });
      created.push({ id: u.id, username: u.username, fullName: u.fullName });
    } catch (err: any) {
      skipped.push({
        username: item.username,
        reason: err.code === 'P2002' ? 'Username/email/mã NV trùng' : err.message?.slice(0, 80) || 'Lỗi',
      });
    }
  }

  res.json({ created: created.length, skipped: skipped.length, details: { created, skipped } });
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
