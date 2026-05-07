import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Allow large PDF uploads via base64
const maxPdfBytes = 8 * 1024 * 1024; // 8 MB

const swapInclude = {
  schedule: {
    include: {
      department: { select: { id: true, name: true, code: true } },
      shiftType: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, fullName: true } },
    },
  },
  requester: { select: { id: true, fullName: true, departmentId: true } },
  targetUser: { select: { id: true, fullName: true, departmentId: true } },
  reviewedBy: { select: { id: true, fullName: true } },
};

/**
 * GET /api/swaps - list swap requests
 * staff: own (requester or target)
 * dept_lead: department's
 * admin: all
 */
router.get('/', authenticate, async (req, res) => {
  const where: any = {};
  const status = req.query.status as string | undefined;
  if (status) where.status = status;

  if (req.user!.role === 'staff') {
    where.OR = [{ requesterId: req.user!.id }, { targetUserId: req.user!.id }];
  } else if (req.user!.role === 'department_lead') {
    where.schedule = { departmentId: req.user!.departmentId };
  }

  const swaps = await prisma.shiftSwap.findMany({
    where,
    include: swapInclude as any,
    orderBy: { createdAt: 'desc' },
  });
  res.json(swaps);
});

/**
 * POST /api/swaps - create swap request (any authenticated user)
 */
router.post('/', authenticate, async (req, res) => {
  const schema = z.object({
    scheduleId: z.string().uuid(),
    targetUserId: z.string().uuid(),
    reason: z.string().optional(),
    signedFormPdf: z.string().optional(),       // base64 (data:application/pdf;base64,...)
    signedFormFilename: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  // Reject oversized PDFs
  if (parsed.data.signedFormPdf && parsed.data.signedFormPdf.length > maxPdfBytes) {
    return res.status(413).json({ error: 'File PDF quá lớn (tối đa 6MB sau base64)' });
  }

  const sched = await prisma.schedule.findUnique({ where: { id: parsed.data.scheduleId } });
  if (!sched) return res.status(404).json({ error: 'Không tìm thấy ca trực' });

  // staff can only swap their own schedule
  if (req.user!.role === 'staff' && sched.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Chỉ có thể đổi ca trực của chính mình' });
  }

  if (parsed.data.targetUserId === sched.userId) {
    return res.status(400).json({ error: 'Không thể đổi cho chính người đang trực' });
  }

  // prevent duplicate pending requests
  const existing = await prisma.shiftSwap.findFirst({
    where: { scheduleId: parsed.data.scheduleId, status: 'pending' },
  });
  if (existing) return res.status(409).json({ error: 'Ca trực này đã có yêu cầu đổi đang chờ duyệt' });

  const swap = await prisma.shiftSwap.create({
    data: {
      scheduleId: parsed.data.scheduleId,
      requesterId: req.user!.id,
      targetUserId: parsed.data.targetUserId,
      reason: parsed.data.reason,
      status: 'pending',
      signedFormPdf: parsed.data.signedFormPdf,
      signedFormFilename: parsed.data.signedFormFilename,
    },
    include: swapInclude as any,
  });
  res.status(201).json(swap);
});

/**
 * GET /api/swaps/:id/pdf - download signed PDF
 */
router.get('/:id/pdf', authenticate, async (req, res) => {
  const swap = await prisma.shiftSwap.findUnique({
    where: { id: req.params.id as string },
    select: { signedFormPdf: true, signedFormFilename: true },
  });
  if (!swap || !swap.signedFormPdf) return res.status(404).json({ error: 'Không có file' });
  // strip data URI prefix if present
  const base64 = swap.signedFormPdf.replace(/^data:application\/pdf;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${swap.signedFormFilename || 'don-doi-truc.pdf'}"`);
  res.send(buf);
});

/**
 * POST /api/swaps/:id/approve - admin only
 * Applies the swap: schedule.userId = targetUserId
 */
router.post('/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  const id = req.params.id as string;
  const swap = await prisma.shiftSwap.findUnique({ where: { id } });
  if (!swap) return res.status(404).json({ error: 'Không tìm thấy' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu đã được xử lý' });

  const result = await prisma.$transaction([
    prisma.schedule.update({
      where: { id: swap.scheduleId },
      data: { userId: swap.targetUserId },
    }),
    prisma.shiftSwap.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        reviewNote: req.body.note,
      },
      include: swapInclude as any,
    }),
  ]);
  res.json(result[1]);
});

/**
 * POST /api/swaps/:id/reject - admin only
 */
router.post('/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  const id = req.params.id as string;
  const swap = await prisma.shiftSwap.findUnique({ where: { id } });
  if (!swap) return res.status(404).json({ error: 'Không tìm thấy' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu đã được xử lý' });

  const updated = await prisma.shiftSwap.update({
    where: { id },
    data: {
      status: 'rejected',
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
      reviewNote: req.body.note,
    },
    include: swapInclude as any,
  });
  res.json(updated);
});

/**
 * DELETE /api/swaps/:id - cancel own pending request
 */
router.delete('/:id', authenticate, async (req, res) => {
  const id = req.params.id as string;
  const swap = await prisma.shiftSwap.findUnique({ where: { id } });
  if (!swap) return res.status(404).json({ error: 'Không tìm thấy' });

  const isAdmin = req.user!.role === 'admin';
  const isOwner = swap.requesterId === req.user!.id;

  // Admin: xoá được mọi trạng thái (kể cả approved/rejected)
  // Non-admin: chỉ huỷ được đơn của mình ở trạng thái pending
  if (!isAdmin) {
    if (!isOwner) return res.status(403).json({ error: 'Không có quyền' });
    if (swap.status !== 'pending') return res.status(400).json({ error: 'Chỉ huỷ được yêu cầu đang chờ' });
  }

  await prisma.shiftSwap.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
