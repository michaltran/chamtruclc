-- =========================================================
-- Migration 002: Gộp tất cả mã ca → chỉ còn T/C/L
-- =========================================================
-- Theo quy định: chỉ có 3 mã ca:
--   T = Trực ngày thường (weekday)
--   C = Trực cuối tuần (T7/CN)
--   L = Trực ngày Lễ
--
-- Các mã TLD/CLD/LLD (Lãnh đạo), TC/CC/LC (Cấp cứu),
-- THS/CHS/LHS (Hồi sức) đều là biến thể cũ — bỏ.
-- Việc phân biệt khoa chuyên môn / Lãnh đạo / cấp cứu được
-- xác định qua department_id, không qua mã ca.
-- =========================================================

BEGIN;

DO $$
DECLARE
  t_id UUID;
  c_id UUID;
  l_id UUID;
BEGIN
  SELECT id INTO t_id FROM shift_types WHERE code = 'T';
  SELECT id INTO c_id FROM shift_types WHERE code = 'C';
  SELECT id INTO l_id FROM shift_types WHERE code = 'L';

  IF t_id IS NULL OR c_id IS NULL OR l_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu shift_type T/C/L';
  END IF;

  -- T family: weekday variants → T
  UPDATE schedules SET shift_type_id = t_id
    WHERE shift_type_id IN (
      SELECT id FROM shift_types WHERE code IN ('TLD','TC','THS')
    );

  -- C family: weekend variants → C
  UPDATE schedules SET shift_type_id = c_id
    WHERE shift_type_id IN (
      SELECT id FROM shift_types WHERE code IN ('CLD','CC','CHS')
    );

  -- L family: holiday variants → L
  UPDATE schedules SET shift_type_id = l_id
    WHERE shift_type_id IN (
      SELECT id FROM shift_types WHERE code IN ('LLD','LC','LHS')
    );
END $$;

-- Xoá các shift_types không dùng nữa
DELETE FROM shift_types
WHERE code IN ('TLD','CLD','LLD','TC','CC','LC','THS','CHS','LHS');

COMMIT;
