"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const exceljs_1 = __importDefault(require("exceljs"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/reports/monthly?year=2026&month=5&departmentId=...
 * Báo cáo thống kê theo tháng
 */
router.get('/monthly', auth_1.authenticate, async (req, res) => {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    let departmentId = req.query.departmentId;
    // Department lead chỉ xem khoa mình
    if (req.user.role === 'department_lead') {
        departmentId = req.user.departmentId;
    }
    // Sử dụng raw query với view v_monthly_stats
    const where = departmentId
        ? client_1.Prisma.sql `AND department_id = ${departmentId}::uuid`
        : client_1.Prisma.empty;
    const stats = await prisma.$queryRaw `
    SELECT * FROM v_monthly_stats
    WHERE year = ${year} AND month = ${month}
    ${where}
    ORDER BY department_name, full_name
  `;
    const summary = {
        totalShifts: stats.reduce((s, r) => s + Number(r.total_shifts), 0),
        totalHours: stats.reduce((s, r) => s + Number(r.total_hours || 0), 0),
        totalAmount: stats.reduce((s, r) => s + Number(r.total_amount || 0), 0),
        totalUsers: stats.length,
    };
    res.json({ stats, summary });
});
/**
 * GET /api/reports/export?year=2026&month=5&departmentId=...
 * Xuất Excel báo cáo tháng
 */
router.get('/export', auth_1.authenticate, (0, auth_1.authorize)('admin', 'department_lead'), async (req, res) => {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    let departmentId = req.query.departmentId;
    if (req.user.role === 'department_lead') {
        departmentId = req.user.departmentId;
    }
    const where = departmentId
        ? client_1.Prisma.sql `AND department_id = ${departmentId}::uuid`
        : client_1.Prisma.empty;
    const stats = await prisma.$queryRaw `
      SELECT * FROM v_monthly_stats
      WHERE year = ${year} AND month = ${month}
      ${where}
      ORDER BY department_name, full_name
    `;
    const wb = new exceljs_1.default.Workbook();
    const ws = wb.addWorksheet(`Báo cáo ${month}-${year}`);
    ws.columns = [
        { header: 'Mã NV', key: 'employee_code', width: 12 },
        { header: 'Họ tên', key: 'full_name', width: 25 },
        { header: 'Chức danh', key: 'title', width: 20 },
        { header: 'Khoa', key: 'department_name', width: 25 },
        { header: 'Ca ngày', key: 'day_shifts', width: 10 },
        { header: 'Ca đêm', key: 'night_shifts', width: 10 },
        { header: 'Ca 24h', key: 'full_day_shifts', width: 10 },
        { header: 'Cuối tuần', key: 'weekend_shifts', width: 10 },
        { header: 'Ngày lễ', key: 'holiday_shifts', width: 10 },
        { header: 'Tổng ca', key: 'total_shifts', width: 10 },
        { header: 'Tổng giờ', key: 'total_hours', width: 12 },
        { header: 'Phụ cấp (VNĐ)', key: 'total_amount', width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F1FB' },
    };
    stats.forEach((row) => ws.addRow(row));
    // Hàng tổng
    const lastRow = ws.rowCount + 1;
    ws.getCell(`A${lastRow}`).value = 'TỔNG CỘNG';
    ws.getCell(`A${lastRow}`).font = { bold: true };
    ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((col) => {
        ws.getCell(`${col}${lastRow}`).value = {
            formula: `SUM(${col}2:${col}${lastRow - 1})`,
        };
        ws.getCell(`${col}${lastRow}`).font = { bold: true };
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-${month}-${year}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
});
/**
 * GET /api/reports/reconciliation?year=2026&month=5
 * Đối chiếu cuối tháng - so sánh lịch đã phân vs đã duyệt
 */
router.get('/reconciliation', auth_1.authenticate, async (req, res) => {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);
    let departmentId = req.query.departmentId;
    if (req.user.role === 'department_lead') {
        departmentId = req.user.departmentId;
    }
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const where = { shiftDate: { gte: startDate, lte: endDate } };
    if (departmentId)
        where.departmentId = departmentId;
    const breakdown = await prisma.schedule.groupBy({
        by: ['status'],
        where,
        _count: true,
    });
    const conflicts = await prisma.$queryRaw `
    SELECT user_id, shift_date, COUNT(*) AS cnt
    FROM schedules
    WHERE shift_date BETWEEN ${startDate} AND ${endDate}
    ${departmentId ? client_1.Prisma.sql `AND department_id = ${departmentId}::uuid` : client_1.Prisma.empty}
    GROUP BY user_id, shift_date
    HAVING COUNT(*) > 1
  `;
    res.json({ breakdown, conflicts });
});
exports.default = router;
//# sourceMappingURL=report.routes.js.map