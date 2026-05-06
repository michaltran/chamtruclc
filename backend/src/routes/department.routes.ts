import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (_req, res) => {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  res.json(departments);
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const schema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(150),
    description: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  const dept = await prisma.department.create({ data: parsed.data });
  res.status(201).json(dept);
});

router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const updated = await prisma.department.update({
    where: { id: req.params.id as string },
    data: req.body,
  });
  res.json(updated);
});

export default router;
