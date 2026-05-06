# Hệ thống quản lý chấm công trực

Ứng dụng web full-stack chuyển đổi từ Google Sheets, dành cho quản lý lịch trực và báo cáo công cuối tháng cho các khoa trong bệnh viện.

## Stack công nghệ

| Tầng | Công nghệ |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + Prisma ORM + Zod |
| Database | PostgreSQL 14+ (server vật lý) |
| Auth | JWT + bcrypt |
| Deploy | Vercel (frontend) / iNet hoặc bare-metal (backend + DB) |

## Cấu trúc dự án

```
duty-roster-app/
├── backend/                 # API server (Node.js + Express)
│   ├── prisma/
│   │   └── schema.prisma   # Schema ORM
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth, RBAC
│   │   ├── services/
│   │   └── server.ts       # Entry point
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # Next.js app
│   ├── app/                # Pages (App Router)
│   ├── components/
│   ├── lib/
│   │   └── api.ts          # API client
│   └── package.json
├── database/
│   └── schema.sql          # Schema gốc PostgreSQL
└── docs/                   # Tài liệu kỹ thuật
```

## Phân quyền (RBAC)

| Vai trò | Quyền |
|---|---|
| `admin` | Toàn quyền: quản lý nhân sự, khoa, duyệt lịch, xem audit log |
| `department_lead` | Nhập lịch khoa mình, đối chiếu cuối tháng, xuất báo cáo khoa |
| `staff` | Xem lịch trực cá nhân |

## Cài đặt và triển khai

### 1. Chuẩn bị server vật lý cho PostgreSQL

```bash
# Cài PostgreSQL 14+ trên Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Tạo database và user
sudo -u postgres psql
CREATE DATABASE duty_roster;
CREATE USER duty_user WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE duty_roster TO duty_user;
\q

# Nhập schema
psql -U duty_user -d duty_roster -f database/schema.sql

# Mở cổng 5432 cho backend kết nối (cấu hình pg_hba.conf và postgresql.conf)
```

### 2. Backend (chạy trên iNet hoặc cùng server với DB)

```bash
cd backend
cp .env.example .env
# Chỉnh sửa DATABASE_URL, JWT_SECRET, FRONTEND_URL trong .env

npm install
npx prisma generate
npx prisma migrate deploy   # áp dụng schema
npm run build
npm start                   # production
# hoặc: npm run dev          # development
```

Khuyến nghị dùng `pm2` hoặc `systemd` để chạy backend như service:

```bash
npm install -g pm2
pm2 start dist/server.js --name duty-api
pm2 save
pm2 startup
```

### 3. Frontend (deploy lên Vercel)

```bash
cd frontend
npm install

# Tạo .env.local
echo 'NEXT_PUBLIC_API_URL=https://api.your-domain.vn/api' > .env.local

npm run dev          # dev mode
npm run build        # production build
```

Deploy Vercel:
```bash
npm install -g vercel
vercel
# Đặt env NEXT_PUBLIC_API_URL trong dashboard Vercel
```

### 4. Tài khoản admin mặc định

```
Username: admin
Password: admin123
```

**Bắt buộc đổi mật khẩu ngay sau lần đăng nhập đầu tiên.**

## Tính năng chính

### Cho Admin
- Quản lý toàn bộ nhân sự, khoa, loại ca trực
- Xem và sửa lịch trực mọi khoa
- Duyệt/từ chối lịch trực do đại diện khoa nộp
- Xem audit log toàn hệ thống
- Xuất báo cáo Excel cho mọi khoa

### Cho Đại diện khoa (Department Lead)
- Nhập lịch trực hàng tuần/tháng cho khoa mình
- Sửa lịch ở trạng thái draft
- Nộp lịch cuối tháng để admin duyệt
- Đối chiếu công cuối tháng (so sánh đã phân vs đã duyệt)
- Xuất báo cáo Excel cho khoa mình

### Cho Nhân viên (Staff)
- Xem lịch trực cá nhân
- Xem báo cáo công cá nhân

## Logic chấm công tự động

Theo yêu cầu, hệ thống áp dụng logic "tự động theo ca đã phân công":

1. Đại diện khoa phân ca cho nhân viên X vào ngày Y
2. Hệ thống tự động ghi nhận đó là công của X (không cần check-in thủ công)
3. View `v_monthly_stats` tự động tính toán:
   - Số ca ngày/đêm/24h
   - Số ca cuối tuần (T7, CN)
   - Số ca ngày lễ
   - Tổng giờ trực
   - Tổng phụ cấp (theo hệ số ngày thường/cuối tuần/lễ)

## Logic đối chiếu cuối tháng

1. Trong tháng: đại diện khoa nhập lịch ở trạng thái `draft`
2. Cuối tháng: đại diện khoa nộp lịch → trạng thái `submitted`
3. Admin duyệt → trạng thái `approved`
4. Hệ thống tự kiểm tra:
   - Xung đột ca (1 người có >1 ca trong cùng ngày)
   - Sai lệch giữa lịch nháp và lịch duyệt
5. Báo cáo cuối tháng chỉ tính các ca có status = `approved`

## Bảo mật

- Mật khẩu băm bằng bcrypt (salt 10)
- JWT có thời hạn 8 giờ, có thể cấu hình
- Rate limit 10 lần/15 phút cho endpoint login
- Helmet bảo vệ HTTP headers
- CORS giới hạn origin
- Audit log mọi thao tác CREATE/UPDATE/DELETE
- Soft delete cho user và department

## Backup & Disaster Recovery

```bash
# Backup hằng ngày (cron)
0 2 * * * pg_dump -U duty_user duty_roster | gzip > /backup/duty_$(date +\%Y\%m\%d).sql.gz

# Giữ 30 ngày gần nhất
find /backup -name "duty_*.sql.gz" -mtime +30 -delete
```

## Lộ trình tiếp theo

- [ ] Tạo các trang frontend (login, dashboard, schedule, reports)
- [ ] Migration script chuyển dữ liệu từ Google Sheets sang
- [ ] Mobile-responsive UI
- [ ] Push notification khi có lịch trực mới
- [ ] Tích hợp xuất PDF cho báo cáo
- [ ] Dashboard analytics nâng cao

## Liên hệ hỗ trợ

Nếu cần hỗ trợ triển khai hoặc tùy chỉnh, vui lòng cung cấp:
- File Google Sheets hiện tại (export Excel)
- Quy trình nghiệp vụ chi tiết
- Yêu cầu báo cáo đặc thù
