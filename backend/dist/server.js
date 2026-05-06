"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const department_routes_1 = __importDefault(require("./routes/department.routes"));
const schedule_routes_1 = __importDefault(require("./routes/schedule.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// Security & middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL?.split(',') || 'http://localhost:3000',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, morgan_1.default)('combined'));
// Rate limit cho login
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Quá nhiều yêu cầu, thử lại sau 15 phút' },
});
// Routes
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authLimiter, auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/departments', department_routes_1.default);
app.use('/api/schedules', schedule_routes_1.default);
app.use('/api/reports', report_routes_1.default);
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err);
    res.status(500).json({
        error: 'Lỗi hệ thống',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});
app.listen(PORT, () => {
    console.log(`API server đang chạy tại http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map