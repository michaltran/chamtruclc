"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/users?departmentId=...
 */
router.get('/', auth_1.authenticate, async (req, res) => {
    const where = { isActive: true };
    if (req.user.role === 'department_lead') {
        where.departmentId = req.user.departmentId;
    }
    else if (req.query.departmentId) {
        where.departmentId = req.query.departmentId;
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
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    const schema = zod_1.z.object({
        username: zod_1.z.string().min(3),
        password: zod_1.z.string().min(6),
        fullName: zod_1.z.string().min(1),
        email: zod_1.z.string().email().optional(),
        employeeCode: zod_1.z.string().optional(),
        role: zod_1.z.enum(['admin', 'department_lead', 'staff']).default('staff'),
        departmentId: zod_1.z.string().uuid().optional(),
        title: zod_1.z.string().optional(),
        phone: zod_1.z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.errors });
    const { password, ...rest } = parsed.data;
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma.user.create({
        data: { ...rest, passwordHash },
    });
    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json(safeUser);
});
/**
 * PATCH /api/users/:id
 */
router.patch('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
    });
    const { passwordHash: _, ...safeUser } = updated;
    res.json(safeUser);
});
/**
 * DELETE /api/users/:id (soft delete)
 */
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: false },
    });
    res.json({ success: true });
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map