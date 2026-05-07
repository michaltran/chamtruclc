import { PrismaClient } from '@prisma/client';

// Parent-child mapping by code
// Khoa Chẩn đoán hình ảnh là khoa cha "ảo" — nhân sự thuộc CDHA chia ca trực
// vào các phòng con (Phòng Siêu âm, CT-Scanner, Xquang).
export const PARENT_OF: Record<string, string> = {
  'CC-NGOAI': 'NGOAI',
  'CC-SAN':   'SAN',
  'HL-CC':    'HL',
  'SAM':      'CDHA',
  'CT':       'CDHA',
  'XQUANG':   'CDHA',
};

export const CHILDREN_OF: Record<string, string[]> = {};
Object.entries(PARENT_OF).forEach(([child, parent]) => {
  if (!CHILDREN_OF[parent]) CHILDREN_OF[parent] = [];
  CHILDREN_OF[parent].push(child);
});

// Khoa "ảo" — chỉ tồn tại để gộp ở chấm trực, không có ca trực trực tiếp
export const VIRTUAL_PARENT_CODES = ['CDHA'];

/**
 * Trả về Set các department IDs mà user (admin/department_lead) có quyền truy cập.
 * - Admin: null (toàn quyền — caller bỏ qua check)
 * - Dept_lead: tập hợp { khoa của user (user_departments) } ∪ { các khoa con của những khoa đó }
 */
export async function getAccessibleDeptIds(
  prisma: PrismaClient,
  userId: string,
  role: string
): Promise<Set<string> | null> {
  if (role === 'admin') return null;

  // Lấy tất cả khoa user thuộc về (user_departments + fallback users.department_id)
  const memberships = await prisma.userDepartment.findMany({ where: { userId } });
  const ownDeptIds = new Set(memberships.map(m => m.departmentId));
  if (ownDeptIds.size === 0) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    if (u?.departmentId) ownDeptIds.add(u.departmentId);
  }

  if (ownDeptIds.size === 0) return new Set();

  // Lấy code → id map của tất cả khoa user thuộc về
  const ownDepts = await prisma.department.findMany({
    where: { id: { in: Array.from(ownDeptIds) } },
    select: { id: true, code: true },
  });

  // Tìm các khoa con (theo PARENT_OF mapping)
  const childCodes: string[] = [];
  ownDepts.forEach(d => {
    const children = CHILDREN_OF[d.code] || [];
    childCodes.push(...children);
  });

  if (childCodes.length > 0) {
    const childDepts = await prisma.department.findMany({
      where: { code: { in: childCodes } },
      select: { id: true },
    });
    childDepts.forEach(d => ownDeptIds.add(d.id));
  }

  return ownDeptIds;
}
