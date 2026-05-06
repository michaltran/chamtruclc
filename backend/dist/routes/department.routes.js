"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.get('/', auth_1.authenticate, async (_req, res) => {
    const departments = await prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: { _count: { select: { users: true } } },
    });
    res.json(departments);
});
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    const schema = zod_1.z.object({
        code: zod_1.z.string().min(1).max(20),
        name: zod_1.z.string().min(1).max(150),
        description: zod_1.z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.errors });
    const dept = await prisma.department.create({ data: parsed.data });
    res.status(201).json(dept);
});
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    const updated = await prisma.department.update({
        where: { id: req.params.id },
        data: req.body,
    });
    res.json(updated);
});
exports.default = router;
//# sourceMappingURL=department.routes.js.map