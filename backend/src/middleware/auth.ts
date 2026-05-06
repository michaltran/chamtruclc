import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'department_lead' | 'staff';
  departmentId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

/**
 * Middleware xác thực JWT token
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

/**
 * Middleware kiểm tra role
 * Cách dùng: authorize('admin'), authorize('admin', 'department_lead')
 */
export function authorize(...allowedRoles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
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
export function checkDepartmentAccess(
  req: Request,
  targetDepartmentId: string
): boolean {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'department_lead') {
    return req.user.departmentId === targetDepartmentId;
  }
  return false;
}
