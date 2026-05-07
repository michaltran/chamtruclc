-- =========================================================
-- Migration 003: Khôi phục 6 mã ca chuyên môn
-- =========================================================
-- Migration 002 đã gộp nhầm cả TC/CC/LC (cấp cứu) và
-- THS/CHS/LHS (hồi sức) về T/C/L. Đây là 6 mã CHUẨN cần giữ.
-- Chỉ TLD/CLD/LLD (Lãnh đạo) là tự bịa, không khôi phục.
--
-- Logic re-point dựa vào department_code của schedule:
--   - Khoa cấp cứu (CC-HSTC, HL-CC, CC-NGOAI, CC-SAN):
--       T→TC, C→CC, L→LC
--   - Khoa hồi sức (GMHS):
--       T→THS, C→CHS, L→LHS
--   - Khoa khác: giữ nguyên T/C/L
-- =========================================================

BEGIN;

-- 1. Tạo lại 6 shift_types đã xoá
INSERT INTO shift_types (code, name, start_time, end_time, duration_hours, color, is_active) VALUES
  ('TC',  'Trực cấp cứu trong tuần 24/24',                  '07:00','07:00', 24, '#0d9488', TRUE),
  ('CC',  'Trực cấp cứu thứ 7, CN 24/24',                   '07:00','07:00', 24, '#dc2626', TRUE),
  ('LC',  'Trực cấp cứu ngày Lễ 24/24',                     '07:00','07:00', 24, '#ca8a04', TRUE),
  ('THS', 'Phiên trực ngày thường hồi sức hồi tỉnh 24/24',  '07:00','07:00', 24, '#4f46e5', TRUE),
  ('CHS', 'Phiên trực thứ 7, CN hồi sức hồi tỉnh 24/24',    '07:00','07:00', 24, '#7c3aed', TRUE),
  ('LHS', 'Phiên trực ngày Lễ, tết hồi sức hồi tỉnh 24/24', '07:00','07:00', 24, '#db2777', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Re-point schedules theo dept
DO $$
DECLARE
  t_id  UUID; c_id  UUID; l_id  UUID;
  tc_id UUID; cc_id UUID; lc_id UUID;
  ths_id UUID; chs_id UUID; lhs_id UUID;
BEGIN
  SELECT id INTO t_id  FROM shift_types WHERE code = 'T';
  SELECT id INTO c_id  FROM shift_types WHERE code = 'C';
  SELECT id INTO l_id  FROM shift_types WHERE code = 'L';
  SELECT id INTO tc_id FROM shift_types WHERE code = 'TC';
  SELECT id INTO cc_id FROM shift_types WHERE code = 'CC';
  SELECT id INTO lc_id FROM shift_types WHERE code = 'LC';
  SELECT id INTO ths_id FROM shift_types WHERE code = 'THS';
  SELECT id INTO chs_id FROM shift_types WHERE code = 'CHS';
  SELECT id INTO lhs_id FROM shift_types WHERE code = 'LHS';

  -- Khoa cấp cứu: T→TC, C→CC, L→LC
  UPDATE schedules s SET shift_type_id = tc_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code IN ('CC-HSTC','HL-CC','CC-NGOAI','CC-SAN')
     AND s.shift_type_id = t_id;

  UPDATE schedules s SET shift_type_id = cc_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code IN ('CC-HSTC','HL-CC','CC-NGOAI','CC-SAN')
     AND s.shift_type_id = c_id;

  UPDATE schedules s SET shift_type_id = lc_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code IN ('CC-HSTC','HL-CC','CC-NGOAI','CC-SAN')
     AND s.shift_type_id = l_id;

  -- Khoa hồi sức (GMHS): T→THS, C→CHS, L→LHS
  UPDATE schedules s SET shift_type_id = ths_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code = 'GMHS'
     AND s.shift_type_id = t_id;

  UPDATE schedules s SET shift_type_id = chs_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code = 'GMHS'
     AND s.shift_type_id = c_id;

  UPDATE schedules s SET shift_type_id = lhs_id
   FROM departments d
   WHERE s.department_id = d.id
     AND d.code = 'GMHS'
     AND s.shift_type_id = l_id;
END $$;

COMMIT;
