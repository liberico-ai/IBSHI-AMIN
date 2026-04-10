import prisma from "@/lib/prisma";

export async function listEmployees(filters: {
  search?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}) {
  const { search, departmentId, status, page = 1, limit = 20 } = filters;
  const where: any = {};
  if (search) where.OR = [{ fullName: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }];
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { code: "asc" },
    }),
    prisma.employee.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getEmployee(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      position: true,
      contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      certificates: { orderBy: { expiryDate: "asc" } },
    },
  });
}

export async function createEmployee(data: Parameters<typeof prisma.employee.create>[0]["data"]) {
  return prisma.employee.create({ data });
}

export async function updateEmployee(id: string, data: Parameters<typeof prisma.employee.update>[0]["data"]) {
  return prisma.employee.update({ where: { id }, data });
}
