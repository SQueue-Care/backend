import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/errors";
import { getScheduleSlotAvailability, toBookingDate } from "../booking/booking-capacity";
import type {
  CreateScheduleInput,
  ListSchedulesQuery,
  UpdateScheduleInput,
} from "./schedules.schema";

export async function listSchedules(filters: ListSchedulesQuery) {
  const schedules = await prisma.schedule.findMany({
    where: {
      doctorId: filters.doctorId,
      departmentId: filters.departmentId,
      dayOfWeek: filters.dayOfWeek,
      isActive: true,
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: {
      doctor: { include: { user: { select: { name: true } } } },
      department: true,
    },
  });

  if (!filters.date) {
    return schedules;
  }

  const bookingDate = toBookingDate(filters.date);
  const enriched = await Promise.all(
    schedules.map(async (schedule) => {
      const slot = await getScheduleSlotAvailability(schedule.id, bookingDate);
      return {
        ...schedule,
        booked: slot.booked,
        remaining: slot.remaining,
        isFull: slot.isFull,
      };
    }),
  );

  return enriched;
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

export async function getScheduleCapacity(scheduleId: string, dateInput?: Date | string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) throw new NotFoundError("Schedule tidak ditemukan");

  const bookingDate = dateInput ? toBookingDate(dateInput) : toBookingDate(new Date());
  const slot = await getScheduleSlotAvailability(scheduleId, bookingDate);

  return {
    total: slot.capacity,
    booked: slot.booked,
    available: slot.remaining,
    date: bookingDate.toISOString().split("T")[0],
  };
}
