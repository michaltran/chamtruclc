"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.checkDepartmentAccess = checkDepartmentAccess;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
/**
 * Middleware xác thực JWT token
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
    }
}
/**
 * Middleware kiểm tra role
 * Cách dùng: authorize('admin'), authorize('admin', 'department_lead')
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Chưa đăng nhập' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Không có quyền thực hiện thao tác này' });
        }
        next();
    };
}
/**
 * Kiểm tra quyền truy cập theo khoa
 * Admin: truy cập mọi khoa
 * Department lead: chỉ khoa mình quản lý
 * Staff: chỉ dữ liệu cá nhân
 */
function checkDepartmentAccess(req, targetDepartmentId) {
    if (!req.user)
        return false;
    if (req.user.role === 'admin')
        return true;
    if (req.user.role === 'department_lead') {
        return req.user.departmentId === targetDepartmentId;
    }
    return false;
}
//# sourceMappingURL=auth.js.map