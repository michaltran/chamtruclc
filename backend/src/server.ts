import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import departmentRoutes from './routes/department.routes';
import scheduleRoutes from './routes/schedule.routes';
import reportRoutes from './routes/report.routes';
import swapRoutes from './routes/swap.routes';

const app = express();
const PORT = process.env.PORT || 4000;

// Security & middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL?.split(',') || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Rate limit cho login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Quá nhiều yêu cầu, thử lại sau 15 phút' },
});

// Routes
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/swaps', swapRoutes);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Lỗi hệ thống',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`API server đang chạy tại http://localhost:${PORT}`);
});
