import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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

  res.json(users.map(({ passwordHash: _, ...u }) => u));
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

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { ...rest, passwordHash },
  });

  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

/**
 * PATCH /api/users/:id
 */
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.params.id as string },
    data: req.body,
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
