-- =========================================================
-- HỆ THỐNG QUẢN LÝ CHẤM CÔNG TRỰC - DATABASE SCHEMA
-- PostgreSQL 14+
-- =========================================================

-- Bật extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- 1. BẢNG KHOA / ĐƠN VỊ
-- =========================================================
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20)  UNIQUE NOT NULL,        -- mã khoa: NOI, NGOAI, SAN, NHI...
    name        VARCHAR(150) NOT NULL,                -- tên đầy đủ
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 2. BẢNG NGƯỜI DÙNG
-- =========================================================
CREATE TYPE user_role AS ENUM ('admin', 'department_lead', 'staff');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(150) UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    employee_code   VARCHAR(50)  UNIQUE,              -- mã nhân viên
    role            user_role NOT NULL DEFAULT 'staff',
    department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
    phone           VARCHAR(20),
    title           VARCHAR(100),                     -- chức danh: BS, ĐD, KTV...
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_role ON users(role);

-- =========================================================
-- 3. BẢNG LOẠI CA TRỰC
-- =========================================================
CREATE TABLE shift_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(10)  UNIQUE NOT NULL,    -- D, N, 24
    name            VARCHAR(50)  NOT NULL,            -- Ngày, Đêm, 24h
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    duration_hours  DECIMAL(4,2) NOT NULL,            -- số giờ trực
    base_amount     DECIMAL(12,2) DEFAULT 0,          -- phụ cấp cơ bản (VNĐ)
    weekend_coef    DECIMAL(4,2) DEFAULT 1.5,         -- hệ số cuối tuần
    holiday_coef    DECIMAL(4,2) DEFAULT 2.0,         -- hệ số ngày lễ
    color           VARCHAR(20),                       -- hiển thị calendar
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dữ liệu mặc định 3 loại ca theo yêu cầu
INSERT INTO shift_types (code, name, start_time, end_time, duration_hours, color) VALUES
    ('D',  'Ngày',  '07:00', '17:00', 10.0, '#378ADD'),
    ('N',  'Đêm',   '17:00', '07:00', 14.0, '#7F77DD'),
    ('24', '24h',   '07:00', '07:00', 24.0, '#D85A30');

-- =========================================================
-- 4. BẢNG NGÀY LỄ
-- =========================================================
CREATE TABLE holidays (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    holiday_date DATE NOT NULL UNIQUE,
    name        VARCHAR(150) NOT NULL,
    is_paid     BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 5. BẢNG LỊCH TRỰC (CORE TABLE)
-- =========================================================
CREATE TYPE schedule_status AS ENUM (
    'draft',        -- nháp, đang nhập
    'submitted',    -- đã nộp chờ duyệt
    'approved',     -- đã duyệt
    'rejected',     -- bị từ chối
    'cancelled'     -- đã hủy
);

CREATE TABLE schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    shift_type_id   UUID NOT NULL REFERENCES shift_types(id) ON DELETE RESTRICT,
    shift_date      DATE NOT NULL,
    status          schedule_status NOT NULL DEFAULT 'draft',
    note            TEXT,
    
    -- Tự động tính toán
    is_weekend      BOOLEAN GENERATED ALWAYS AS (
        EXTRACT(DOW FROM shift_date) IN (0, 6)
    ) STORED,
    
    -- Audit fields
    created_by      UUID REFERENCES users(id),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Một người không thể trực 2 ca cùng loại, cùng khoa, trong cùng ngày
    -- (cho phép cùng 1 người trực ở 2 khoa khác nhau cùng ngày: VD CT + Xquang, hoặc khoa chuyên môn + Lãnh đạo)
    CONSTRAINT unique_user_shift_date UNIQUE (user_id, shift_date, shift_type_id, department_id)
);

CREATE INDEX idx_schedules_date ON schedules(shift_date);
CREATE INDEX idx_schedules_user_date ON schedules(user_id, shift_date);
CREATE INDEX idx_schedules_dept_date ON schedules(department_id, shift_date);
CREATE INDEX idx_schedules_status ON schedules(status);

-- =========================================================
-- 6. BẢNG DUYỆT LỊCH (APPROVAL HISTORY)
-- =========================================================
CREATE TYPE approval_action AS ENUM ('submit', 'approve', 'reject', 'revise');

CREATE TABLE approvals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id     UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    actor_id        UUID NOT NULL REFERENCES users(id),
    action          approval_action NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_schedule ON approvals(schedule_id);

-- =========================================================
-- 7. BẢNG ĐỐI CHIẾU CUỐI THÁNG
-- =========================================================
CREATE TYPE reconciliation_status AS ENUM ('pending', 'confirmed', 'disputed', 'finalized');

CREATE TABLE monthly_reconciliations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id   UUID NOT NULL REFERENCES departments(id),
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    
    total_shifts    INTEGER DEFAULT 0,
    total_hours     DECIMAL(8,2) DEFAULT 0,
    total_amount    DECIMAL(14,2) DEFAULT 0,
    
    status          reconciliation_status NOT NULL DEFAULT 'pending',
    submitted_by    UUID REFERENCES users(id),
    submitted_at    TIMESTAMPTZ,
    confirmed_by    UUID REFERENCES users(id),
    confirmed_at    TIMESTAMPTZ,
    note            TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_dept_period UNIQUE (department_id, period_year, period_month)
);

-- =========================================================
-- 8. BẢNG AUDIT LOG (TRUY VẾT MỌI THAO TÁC)
-- =========================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,             -- CREATE, UPDATE, DELETE, LOGIN...
    entity_type     VARCHAR(50) NOT NULL,             -- schedule, user, department...
    entity_id       UUID,
    old_data        JSONB,
    new_data        JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at DESC);

-- =========================================================
-- 9. VIEW: BÁO CÁO THỐNG KÊ THEO THÁNG
-- =========================================================
CREATE OR REPLACE VIEW v_monthly_stats AS
SELECT
    s.user_id,
    u.full_name,
    u.employee_code,
    u.title,
    d.id          AS department_id,
    d.name        AS department_name,
    EXTRACT(YEAR  FROM s.shift_date) AS year,
    EXTRACT(MONTH FROM s.shift_date) AS month,
    
    COUNT(*) FILTER (WHERE st.code = 'D')                       AS day_shifts,
    COUNT(*) FILTER (WHERE st.code = 'N')                       AS night_shifts,
    COUNT(*) FILTER (WHERE st.code = '24')                      AS full_day_shifts,
    COUNT(*) FILTER (WHERE s.is_weekend = TRUE)                 AS weekend_shifts,
    COUNT(*) FILTER (WHERE h.id IS NOT NULL)                    AS holiday_shifts,
    COUNT(*)                                                     AS total_shifts,
    
    SUM(st.duration_hours)                                       AS total_hours,
    SUM(
        st.base_amount * 
        CASE
            WHEN h.id IS NOT NULL          THEN st.holiday_coef
            WHEN s.is_weekend              THEN st.weekend_coef
            ELSE 1.0
        END
    ) AS total_amount
    
FROM schedules s
JOIN users u            ON u.id = s.user_id
JOIN departments d      ON d.id = s.department_id
JOIN shift_types st     ON st.id = s.shift_type_id
LEFT JOIN holidays h    ON h.holiday_date = s.shift_date
WHERE s.status = 'approved'
GROUP BY s.user_id, u.full_name, u.employee_code, u.title,
         d.id, d.name,
         EXTRACT(YEAR FROM s.shift_date),
         EXTRACT(MONTH FROM s.shift_date);

-- =========================================================
-- 10. TRIGGER: TỰ ĐỘNG CẬP NHẬT updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedules_updated   BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================================================
-- DỮ LIỆU SEED MẪU
-- =========================================================
INSERT INTO departments (code, name) VALUES
    ('NOI',   'Khoa Nội tổng hợp'),
    ('NGOAI', 'Khoa Ngoại'),
    ('SAN',   'Khoa Sản'),
    ('NHI',   'Khoa Nhi'),
    ('CC',    'Khoa Cấp cứu'),
    ('HSTC',  'Khoa Hồi sức tích cực'),
    ('XN',    'Khoa Xét nghiệm');

-- Tài khoản admin mặc định
-- Mật khẩu: admin123 (BẮT BUỘC đổi sau khi cài đặt)
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES (
    'admin',
    'admin@hospital.local',
    '$2b$10$rZUoYZb3gYJ6kKjKlYxG7eY5nq9xLxQv1kLqK0vT5QKlCgY3BqLqW',
    'Quản trị viên',
    'admin'
);
