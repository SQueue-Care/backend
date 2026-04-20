import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import type {
  CreateScheduleInput,
  ListSchedulesQuery,
  UpdateScheduleInput,
} from "./schedules.schema";

export async function listSchedules(filters: ListSchedulesQuery) {
  return prisma.schedule.findMany({
    where: {
      doctorId: filters.doctorId,
      departmentId: filters.departmentId,
      dayOfWeek: filters.dayOfWeek,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: {
      doctor: { include: { user: { select: { name: true } } } },
      department: true,
    },
  });
}

export async function getSchedule(id: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { doctor: true, department: true },
  });
  if (!schedule) throw new NotFoundError("Schedule not found");
  return schedule;
}

export async function createSchedule(input: CreateScheduleInput) {
  return prisma.schedule.create({ data: input });
}

export async function updateSchedule(id: string, data: UpdateScheduleInput) {
  return prisma.schedule.update({ where: { id }, data });
}

export async function deleteSchedule(id: string) {
  await prisma.schedule.delete({ where: { id } });
}
