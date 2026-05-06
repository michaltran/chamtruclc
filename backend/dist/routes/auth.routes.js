"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
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
        include: { department: true },
    });
    if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
    const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
    // Cập nhật last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    const token = jsonwebtoken_1.default.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        departmentId: user.departmentId,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
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
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            department: user.department,
        },
    });
});
/**
 * GET /api/auth/me
 */
router.get('/me', auth_1.authenticate, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { department: true },
    });
    if (!user)
        return res.status(404).json({ error: 'Không tìm thấy' });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
});
/**
 * POST /api/auth/change-password
 */
router.post('/change-password', auth_1.authenticate, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    const valid = await bcryptjs_1.default.compare(oldPassword, user.passwordHash);
    if (!valid)
        return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });
    const newHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
    });
    res.json({ success: true });
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map