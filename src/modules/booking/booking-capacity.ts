import { Prisma, QueueStatus, AppointmentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors";

const ACTIVE_QUEUE_STATUSES: QueueStatus[] = [
  QueueStatus.WAITING,
  QueueStatus.CALLED,
  QueueStatus.IN_PROGRESS,
];

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
];

/** Normalisasi tanggal booking ke noon UTC (konsisten dengan antrian). */
export function toBookingDate(dateInput: Date | string): Date {
  const d = new Date(dateInput);
  const dateKey = d.toISOString().split("T")[0] ?? "";
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function isSerializationFailure(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.message.includes("serialization"))
  );
}

export async function withSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (err) {
      if (isSerializationFailure(err) && attempt < maxRetries - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Transaksi booking gagal setelah beberapa percobaan");
}

async function getScheduleBookedCount(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  bookingDate: Date,
): Promise<number> {
  const cap = await tx.scheduleDayCapacity.findUnique({
    where: { scheduleId_bookingDate: { scheduleId, bookingDate } },
    select: { bookedCount: true },
  });
  return cap?.bookedCount ?? 0;
}

async function getDepartmentBookedCount(
  tx: Prisma.TransactionClient,
  departmentId: string,
  bookingDate: Date,
): Promise<number> {
  const cap = await tx.departmentDayCapacity.findUnique({
    where: { departmentId_bookingDate: { departmentId, bookingDate } },
    select: { bookedCount: true },
  });
  return cap?.bookedCount ?? 0;
}

/** Atomic reserve: cek + increment kapasitas jadwal dan kuota poli dalam satu transaksi. */
export async function reserveBookingCapacity(
  tx: Prisma.TransactionClient,
  params: { scheduleId: string; departmentId: string; bookingDate: Date },
): Promise<void> {
  const schedule = await tx.schedule.findUnique({ where: { id: params.scheduleId } });
  if (!schedule) throw new NotFoundError("Schedule tidak ditemukan");
  if (!schedule.isActive) throw new BadRequestError("Jadwal tidak aktif");

  const department = await tx.department.findUnique({ where: { id: params.departmentId } });
  if (!department) throw new NotFoundError("Department not found");

  const scheduleBooked = await getScheduleBookedCount(tx, params.scheduleId, params.bookingDate);
  if (scheduleBooked >= schedule.capacity) {
    throw new ConflictError("Slot penuh, silakan pilih waktu lain");
  }

  const deptBooked = await getDepartmentBookedCount(tx, params.departmentId, params.bookingDate);
  if (deptBooked >= department.dailyBookingQuota) {
    throw new ConflictError("Kuota poli hari ini penuh");
  }

  await tx.scheduleDayCapacity.upsert({
    where: {
      scheduleId_bookingDate: {
        scheduleId: params.scheduleId,
        bookingDate: params.bookingDate,
      },
    },
    create: {
      scheduleId: params.scheduleId,
      bookingDate: params.bookingDate,
      bookedCount: 1,
    },
    update: { bookedCount: { increment: 1 } },
  });

  await tx.departmentDayCapacity.upsert({
    where: {
      departmentId_bookingDate: {
        departmentId: params.departmentId,
        bookingDate: params.bookingDate,
      },
    },
    create: {
      departmentId: params.departmentId,
      bookingDate: params.bookingDate,
      bookedCount: 1,
    },
    update: { bookedCount: { increment: 1 } },
  });
}

/** Reserve hanya kuota poli (walk-in tanpa jadwal spesifik). */
export async function reserveDepartmentQuota(
  tx: Prisma.TransactionClient,
  params: { departmentId: string; bookingDate: Date },
): Promise<void> {
  const department = await tx.department.findUnique({ where: { id: params.departmentId } });
  if (!department) throw new NotFoundError("Department not found");

  const deptBooked = await getDepartmentBookedCount(tx, params.departmentId, params.bookingDate);
  if (deptBooked >= department.dailyBookingQuota) {
    throw new ConflictError("Kuota poli hari ini penuh");
  }

  await tx.departmentDayCapacity.upsert({
    where: {
      departmentId_bookingDate: {
        departmentId: params.departmentId,
        bookingDate: params.bookingDate,
      },
    },
    create: {
      departmentId: params.departmentId,
      bookingDate: params.bookingDate,
      bookedCount: 1,
    },
    update: { bookedCount: { increment: 1 } },
  });
}

export async function releaseBookingCapacity(
  tx: Prisma.TransactionClient,
  params: { scheduleId: string | null; departmentId: string; bookingDate: Date },
): Promise<void> {
  if (params.scheduleId) {
    const scheduleCap = await tx.scheduleDayCapacity.findUnique({
      where: {
        scheduleId_bookingDate: {
          scheduleId: params.scheduleId,
          bookingDate: params.bookingDate,
        },
      },
    });
    if (scheduleCap && scheduleCap.bookedCount > 0) {
      await tx.scheduleDayCapacity.update({
        where: { id: scheduleCap.id },
        data: { bookedCount: { decrement: 1 } },
      });
    }
  }

  const deptCap = await tx.departmentDayCapacity.findUnique({
    where: {
      departmentId_bookingDate: {
        departmentId: params.departmentId,
        bookingDate: params.bookingDate,
      },
    },
  });
  if (deptCap && deptCap.bookedCount > 0) {
    await tx.departmentDayCapacity.update({
      where: { id: deptCap.id },
      data: { bookedCount: { decrement: 1 } },
    });
  }
}

export async function nextQueueNumberInTransaction(
  tx: Prisma.TransactionClient,
  departmentId: string,
  bookingDate: Date,
): Promise<number> {
  const last = await tx.queue.findFirst({
    where: { departmentId, queueDate: bookingDate },
    orderBy: { queueNumber: "desc" },
    select: { queueNumber: true },
  });
  return (last?.queueNumber ?? 0) + 1;
}

export async function assertNoActiveQueueDuplicate(
  tx: Prisma.TransactionClient,
  params: { patientId: string; departmentId: string; bookingDate: Date },
): Promise<void> {
  const duplicate = await tx.queue.findFirst({
    where: {
      patientId: params.patientId,
      departmentId: params.departmentId,
      queueDate: params.bookingDate,
      status: { in: ACTIVE_QUEUE_STATUSES },
    },
  });
  if (duplicate) {
    throw new ConflictError("Pasien sudah memiliki antrian aktif di poli ini hari ini");
  }
}

export type ScheduleSlotAvailability = {
  scheduleId: string;
  capacity: number;
  booked: number;
  remaining: number;
  isFull: boolean;
};

export async function getScheduleSlotAvailability(
  scheduleId: string,
  bookingDate: Date,
): Promise<ScheduleSlotAvailability> {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new NotFoundError("Schedule tidak ditemukan");

  const cap = await prisma.scheduleDayCapacity.findUnique({
    where: { scheduleId_bookingDate: { scheduleId, bookingDate } },
  });
  const booked = cap?.bookedCount ?? 0;
  const remaining = Math.max(0, schedule.capacity - booked);

  return {
    scheduleId,
    capacity: schedule.capacity,
    booked,
    remaining,
    isFull: remaining <= 0,
  };
}

export type DepartmentAvailability = {
  date: string;
  departmentId: string;
  quota: {
    total: number;
    booked: number;
    remaining: number;
    isFull: boolean;
  };
  schedules: Array<
    ScheduleSlotAvailability & {
      doctorId: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }
  >;
};

export async function getDepartmentAvailability(
  departmentId: string,
  dateInput: Date | string,
  doctorId?: string,
): Promise<DepartmentAvailability> {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw new NotFoundError("Department not found");

  const bookingDate = toBookingDate(dateInput);
  const dateKey = bookingDate.toISOString().split("T")[0] ?? "";

  const deptCap = await prisma.departmentDayCapacity.findUnique({
    where: { departmentId_bookingDate: { departmentId, bookingDate } },
  });
  const deptBooked = deptCap?.bookedCount ?? 0;
  const deptRemaining = Math.max(0, department.dailyBookingQuota - deptBooked);

  const schedules = await prisma.schedule.findMany({
    where: {
      departmentId,
      doctorId,
      isActive: true,
    },
    orderBy: [{ startTime: "asc" }],
  });

  const scheduleCaps = await prisma.scheduleDayCapacity.findMany({
    where: {
      scheduleId: { in: schedules.map((s) => s.id) },
      bookingDate,
    },
  });
  const capMap = new Map(scheduleCaps.map((c) => [c.scheduleId, c.bookedCount]));

  const scheduleAvailability = schedules.map((s) => {
    const booked = capMap.get(s.id) ?? 0;
    const remaining = Math.max(0, s.capacity - booked);
    return {
      scheduleId: s.id,
      doctorId: s.doctorId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: s.capacity,
      booked,
      remaining,
      isFull: remaining <= 0 || deptRemaining <= 0,
    };
  });

  return {
    date: dateKey,
    departmentId,
    quota: {
      total: department.dailyBookingQuota,
      booked: deptBooked,
      remaining: deptRemaining,
      isFull: deptRemaining <= 0,
    },
    schedules: scheduleAvailability,
  };
}

/** Pure helper — dipakai unit test untuk simulasi race condition. */
export function tryReserveSlot(bookedCount: number, maxCapacity: number): "ok" | "full" {
  if (bookedCount >= maxCapacity) return "full";
  return "ok";
}

export { ACTIVE_APPOINTMENT_STATUSES, ACTIVE_QUEUE_STATUSES };
