import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import { buildPagination, paginationSkipTake, type PaginationQuery } from "../../utils/pagination";
import type { UpdateUserInput } from "./users.schema";

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsers(query: PaginationQuery) {
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      ...paginationSkipTake(query),
      orderBy: { createdAt: "desc" },
      select: SAFE_SELECT,
    }),
    prisma.user.count(),
  ]);
  return { items, pagination: buildPagination(query.page, query.pageSize, total) };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...SAFE_SELECT, patient: true, doctor: true },
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export async function updateUser(id: string, data: UpdateUserInput) {
  return prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}
