-- =========================================================
-- Migration 001: Cho phép 1 người trực nhiều khoa cùng ngày
-- =========================================================
-- Constraint cũ: UNIQUE (user_id, shift_date, shift_type_id)
--   → chặn cả trường hợp hợp lệ: BS CDHA trực CT + Xquang cùng ngày
--   (cùng shift_type 'T' nhưng khác department_id).
--
-- Constraint mới: UNIQUE (user_id, shift_date, shift_type_id, department_id)
--   → cho phép 1 người trực ≥1 ca cùng loại miễn KHÁC khoa.
--   → vẫn chặn nhập trùng ca thật (cùng người, cùng ngày, cùng loại, cùng khoa).
--
-- Ràng buộc "1 lãnh đạo trực mỗi ngày" được handle riêng trong application code
-- (xem schedule.routes.ts).
-- =========================================================

BEGIN;

-- Trước khi đổi constraint: dọn các bản ghi trùng (user, date, shift_type, dept) nếu có
-- (giữ lại bản ghi tạo sớm nhất, xoá phần còn lại)
DELETE FROM schedules a
USING schedules b
WHERE a.id > b.id
  AND a.user_id       = b.user_id
  AND a.shift_date    = b.shift_date
  AND a.shift_type_id = b.shift_type_id
  AND a.department_id = b.department_id;

-- Drop constraint cũ
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS unique_user_shift_date;

-- Thêm constraint mới
ALTER TABLE schedules
  ADD CONSTRAINT unique_user_shift_date
  UNIQUE (user_id, shift_date, shift_type_id, department_id);

COMMIT;
