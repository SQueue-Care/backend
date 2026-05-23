import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./departments.schema";

//Perubahan buat ngasih jumlah pasien
export async function listDepartments() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: {
      doctors: { 
        include: { 
          user: { select: { name: true } } 
        } 
      },
      _count: {
        select: {
          queues: {
            where: {
              createdAt: { gte: startOfToday },
              status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] }
            }
          }
        }
      }
    }
  });

  return departments.map((dept) => {
    const { _count, ...rest } = dept;
    return {
      ...rest,
      activeQueueCount: _count.queues,
    };
  });
}

export async function getDepartment(id: string) {
  const dept = await prisma.department.findUnique({
    where: { id },
    include: { doctors: { include: { user: { select: { name: true } } } } },
  });
  if (!dept) throw new NotFoundError("Department not found");
  return dept;
}

export async function createDepartment(input: CreateDepartmentInput) {
  return prisma.department.create({
    data: { ...input, code: input.code.toUpperCase() },
  });
}

export async function updateDepartment(id: string, data: UpdateDepartmentInput) {
  return prisma.department.update({ where: { id }, data });
}

export async function deleteDepartment(id: string) {
  await prisma.department.delete({ where: { id } });
}
