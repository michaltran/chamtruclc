import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Cau truc khoa cha-con (parent code -> sub codes)
// Khoa cha hien thi de gop nhom o /cham-truc va /users
const PARENT_OF: Record<string, string> = {
  'CC-NGOAI': 'NGOAI',     // Cap cuu Ngoai -> Khoa Ngoai
  'CC-SAN':   'SAN',       // Cap cuu San   -> Khoa Phu San
  'HL-CC':    'HL',        // Ho ly cap cuu -> Ho ly
  'SAM':      'CDHA',      // Phong Sieu am -> Khoa CDHA
  'CT':       'CDHA',      // Phong CT      -> Khoa CDHA
  'XQUANG':   'CDHA',      // Phong X quang -> Khoa CDHA
};

router.get('/', authenticate, async (_req, res) => {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  // Map code -> id de tra them parentId
  const codeToId: Record<string, string> = {};
  departments.forEach(d => { codeToId[d.code] = d.id; });
  const enriched = departments.map(d => ({
    ...d,
    parentCode: PARENT_OF[d.code] || null,
    parentId: PARENT_OF[d.code] ? (codeToId[PARENT_OF[d.code]] || null) : null,
    isParent: Object.values(PARENT_OF).includes(d.code),
  }));
  res.json(enriched);
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
