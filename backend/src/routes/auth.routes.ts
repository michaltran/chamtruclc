import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      department: true,
      userDepartments: {
        include: { department: { select: { id: true, name: true, code: true } } },
      },
    },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }

  if (!user.passwordHash) {
    return res.status(403).json({ error: 'Tài khoản chưa được cấp quyền đăng nhập. Liên hệ quản trị viên.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }

  // Cập nhật last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      departmentId: user.departmentId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES as any }
  );

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });

  // Default pages by role for users without explicit permissions.
  // Admin: bỏ qua UserPermission cũ — luôn được full quyền (tránh trường hợp DB lưu pages cũ thiếu trang mới).
  const perm = await prisma.userPermission.findUnique({ where: { userId: user.id } });
  const defaultPagesByRole: Record<string, string[]> = {
    admin: ['schedules','swaps','cham-truc','ho-tro-truc','users','departments'],
    department_lead: ['schedules','swaps','users'],
    staff: ['schedules','swaps'],
  };
  const pages = user.role === 'admin'
    ? defaultPagesByRole.admin
    : ((perm?.pages as string[] | undefined) || defaultPagesByRole[user.role] || ['schedules']);

  const userDepts = user.userDepartments.map(ud => ({
    ...ud.department,
    isPrimary: ud.isPrimary,
  }));
  const departmentIds = user.userDepartments.map(ud => ud.departmentId);
  // Fallback nếu chưa có row trong user_departments
  const fallbackDeptIds = departmentIds.length === 0 && user.departmentId
    ? [user.departmentId]
    : departmentIds;

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department,
      departmentId: user.departmentId,
      departments: userDepts,
      departmentIds: fallbackDeptIds,
      pages,
    },
  });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      department: true,
      userDepartments: { include: { department: { select: { id: true, name: true, code: true } } } },
    },
  });
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  const perm = await prisma.userPermission.findUnique({ where: { userId: user.id } });
  const defaultPagesByRole: Record<string, string[]> = {
    admin: ['schedules','swaps','cham-truc','ho-tro-truc','users','departments'],
    department_lead: ['schedules','swaps','users'],
    staff: ['schedules','swaps'],
  };
  const pages = user.role === 'admin'
    ? defaultPagesByRole.admin
    : ((perm?.pages as string[] | undefined) || defaultPagesByRole[user.role] || ['schedules']);
  const departments = user.userDepartments.map(ud => ({ ...ud.department, isPrimary: ud.isPrimary }));
  const departmentIds = user.userDepartments.map(ud => ud.departmentId);
  const finalDeptIds = departmentIds.length === 0 && user.departmentId ? [user.departmentId] : departmentIds;
  const { passwordHash: _, userDepartments: __, ...safeUser } = user;
  res.json({ ...safeUser, pages, departments, departmentIds: finalDeptIds });
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  res.json({ success: true });
});

export default router;
