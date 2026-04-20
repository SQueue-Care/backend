import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./departments.schema";

export async function listDepartments() {
  return prisma.department.findMany({ orderBy: { name: "asc" } });
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
