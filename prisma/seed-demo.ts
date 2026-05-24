/* eslint-disable no-console */
/**
 * Demo seed: 300 queues (May 24–27, 2026) + appointment bookings.
 *
 * Idempotency: records use deterministic IDs with prefix `demo_q_`, `demo_a_`, `demo_b_`.
 * Re-running seed deletes all demo-tagged rows (and queues/bills in the demo date window)
 * before recreating them. Core seed users (admin, doctors, pasien1–3) are untouched.
 */
import {
  AppointmentStatus,
  BillStatus,
  DayOfWeek,
  Doctor,
  Patient,
  PaymentType,
  Prisma,
  PrismaClient,
  QueueStatus,
  VisitStage,
} from "@prisma/client";

const DEMO_QUEUE_PREFIX = "demo_q_";
const DEMO_APPT_PREFIX = "demo_a_";
const DEMO_BILL_PREFIX = "demo_b_";

/** Simulated "today" for status distribution (matches project scenario: May 24, 2026). */
const ANCHOR_TODAY = "2026-05-24";
const DEMO_DATE_ISOS = ["2026-05-24", "2026-05-25", "2026-05-26", "2026-05-27"] as const;

const TOTAL_QUEUES = 300;
const QUEUES_PER_DAY = [90, 70, 70, 70] as const; // sum = 300, heavier on anchor day

const TOTAL_APPOINTMENTS = 120;
const APPT_IN_WINDOW = 55;
const APPT_AFTER_WINDOW = TOTAL_APPOINTMENTS - APPT_IN_WINDOW;

const DIAGNOSES = [
  "Demam ringan, istirahat cukup",
  "Infeksi saluran pernapasan atas",
  "Hipertensi terkontrol",
  "Gastritis akut",
  "Dermatitis kontak",
  "Migrain",
  "Anemia defisiensi besi",
  "Diabetes tipe 2 — kontrol rutin",
];

const MEDICATIONS = [
  "Paracetamol 500 mg, 3x1 tablet setelah makan",
  "Amoxicillin 500 mg, 3x1 kapsul selama 5 hari",
  "Omeprazole 20 mg, 1x1 sebelum sarapan",
  "Salbutamol inhaler saat sesak",
  null,
  null,
];

const ADVICE = [
  "Minum air putih cukup, istirahat 2–3 hari",
  "Hindari makanan pedas dan asam",
  "Kontrol ulang jika gejala memburuk dalam 3 hari",
  "Olahraga ringan dan diet rendah garam",
];

type DeptRef = { id: string; code: string };
type ScheduleRef = { id: string; doctorId: string; departmentId: string; dayOfWeek: DayOfWeek };

export type DemoSeedContext = {
  patients: Patient[];
  doctors: Doctor[];
  departments: DeptRef[];
  schedules: ScheduleRef[];
};

function parseDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function dayOfWeekForDate(iso: string): DayOfWeek {
  const map: DayOfWeek[] = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];
  return map[parseDateOnly(iso).getUTCDay()]!;
}

function pickQueueStatus(dateIso: string, seed: number): QueueStatus {
  const r = seed % 100;
  const isToday = dateIso === ANCHOR_TODAY;
  const isPast = dateIso < ANCHOR_TODAY;

  if (isPast) {
    if (r < 58) return QueueStatus.DONE;
    if (r < 68) return QueueStatus.CANCELLED;
    if (r < 76) return QueueStatus.SKIPPED;
    if (r < 86) return QueueStatus.IN_PROGRESS;
    if (r < 93) return QueueStatus.CALLED;
    return QueueStatus.WAITING;
  }
  if (isToday) {
    if (r < 32) return QueueStatus.WAITING;
    if (r < 42) return QueueStatus.CALLED;
    if (r < 52) return QueueStatus.IN_PROGRESS;
    if (r < 78) return QueueStatus.DONE;
    if (r < 86) return QueueStatus.SKIPPED;
    return QueueStatus.CANCELLED;
  }
  // future days in window
  if (r < 68) return QueueStatus.WAITING;
  if (r < 78) return QueueStatus.CALLED;
  if (r < 86) return QueueStatus.IN_PROGRESS;
  if (r < 93) return QueueStatus.DONE;
  if (r < 97) return QueueStatus.SKIPPED;
  return QueueStatus.CANCELLED;
}

function pickAppointmentStatus(seed: number, scheduledIso: string): AppointmentStatus {
  const r = seed % 100;
  const isPastOrToday = scheduledIso.slice(0, 10) <= ANCHOR_TODAY;

  if (isPastOrToday) {
    if (r < 28) return AppointmentStatus.COMPLETED;
    if (r < 48) return AppointmentStatus.CONFIRMED;
    if (r < 63) return AppointmentStatus.BOOKED;
    if (r < 78) return AppointmentStatus.CANCELLED;
    return AppointmentStatus.NO_SHOW;
  }
  if (r < 15) return AppointmentStatus.CONFIRMED;
  if (r < 55) return AppointmentStatus.BOOKED;
  if (r < 70) return AppointmentStatus.CANCELLED;
  return AppointmentStatus.CONFIRMED;
}

function visitStageForStatus(status: QueueStatus, hasPharmacy: boolean): VisitStage {
  switch (status) {
    case QueueStatus.WAITING:
    case QueueStatus.SKIPPED:
      return VisitStage.WAITING;
    case QueueStatus.CALLED:
      return VisitStage.WAITING;
    case QueueStatus.IN_PROGRESS:
      return VisitStage.EXAMINATION;
    case QueueStatus.CANCELLED:
      return VisitStage.WAITING;
    case QueueStatus.DONE:
      return hasPharmacy ? VisitStage.PHARMACY : VisitStage.COMPLETE;
    default:
      return VisitStage.WAITING;
  }
}

function timestampsForQueue(
  dateIso: string,
  status: QueueStatus,
  queueIndex: number,
): {
  checkInAt: Date;
  calledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  cancelledAt: Date | null;
  adminArrivedAt: Date | null;
  pharmacyCompletedAt: Date | null;
  visitCompletedAt: Date | null;
  actualWaitMinutes: number | null;
} {
  const base = parseDateOnly(dateIso);
  const hour = 8 + (queueIndex % 6);
  const minute = (queueIndex * 7) % 60;
  const checkInAt = new Date(base);
  checkInAt.setUTCHours(hour, minute, 0, 0);

  const calledAt =
    status !== QueueStatus.WAITING
      ? new Date(checkInAt.getTime() + 15 * 60_000)
      : null;
  const startedAt =
    status === QueueStatus.IN_PROGRESS || status === QueueStatus.DONE
      ? new Date((calledAt ?? checkInAt).getTime() + 5 * 60_000)
      : null;
  const finishedAt =
    status === QueueStatus.DONE
      ? new Date((startedAt ?? checkInAt).getTime() + 20 * 60_000)
      : null;
  const cancelledAt = status === QueueStatus.CANCELLED ? new Date(checkInAt.getTime() + 10 * 60_000) : null;
  const adminArrivedAt =
    status === QueueStatus.DONE ? new Date((finishedAt ?? checkInAt).getTime() + 5 * 60_000) : null;
  const pharmacyCompletedAt =
    status === QueueStatus.DONE && queueIndex % 3 === 0
      ? new Date((adminArrivedAt ?? checkInAt).getTime() + 10 * 60_000)
      : null;
  const visitCompletedAt =
    status === QueueStatus.DONE && pharmacyCompletedAt
      ? new Date(pharmacyCompletedAt.getTime() + 5 * 60_000)
      : status === QueueStatus.DONE && queueIndex % 3 !== 0
        ? adminArrivedAt
        : null;

  const actualWaitMinutes =
    startedAt != null
      ? Math.max(0, Math.round((startedAt.getTime() - checkInAt.getTime()) / 60_000))
      : null;

  return {
    checkInAt,
    calledAt,
    startedAt,
    finishedAt,
    cancelledAt,
    adminArrivedAt,
    pharmacyCompletedAt,
    visitCompletedAt,
    actualWaitMinutes,
  };
}

function queueDemoId(dateIso: string, deptCode: string, queueNumber: number): string {
  return `${DEMO_QUEUE_PREFIX}${dateIso}_${deptCode}_${String(queueNumber).padStart(3, "0")}`;
}

function apptDemoId(index: number): string {
  return `${DEMO_APPT_PREFIX}${String(index).padStart(4, "0")}`;
}

function billDemoId(queueId: string): string {
  return `${DEMO_BILL_PREFIX}${queueId.replace(DEMO_QUEUE_PREFIX, "")}`;
}

async function clearDemoData(prisma: PrismaClient): Promise<void> {
  const demoDateFrom = parseDateOnly(DEMO_DATE_ISOS[0]);
  const demoDateTo = parseDateOnly(DEMO_DATE_ISOS[DEMO_DATE_ISOS.length - 1]);

  await prisma.billLineItem.deleteMany({
    where: { bill: { id: { startsWith: DEMO_BILL_PREFIX } } },
  });
  await prisma.bill.deleteMany({ where: { id: { startsWith: DEMO_BILL_PREFIX } } });
  await prisma.waitTimePrediction.deleteMany({
    where: { queue: { id: { startsWith: DEMO_QUEUE_PREFIX } } },
  });

  // Remove non-demo queues in the demo window (e.g. legacy sample rows on May 24)
  const legacyQueues = await prisma.queue.findMany({
    where: {
      queueDate: { gte: demoDateFrom, lte: demoDateTo },
      NOT: { id: { startsWith: DEMO_QUEUE_PREFIX } },
    },
    select: { id: true },
  });
  if (legacyQueues.length > 0) {
    const legacyIds = legacyQueues.map((q) => q.id);
    await prisma.billLineItem.deleteMany({ where: { bill: { queueId: { in: legacyIds } } } });
    await prisma.bill.deleteMany({ where: { queueId: { in: legacyIds } } });
    await prisma.waitTimePrediction.deleteMany({ where: { queueId: { in: legacyIds } } });
    await prisma.queue.deleteMany({ where: { id: { in: legacyIds } } });
  }

  await prisma.queue.deleteMany({ where: { id: { startsWith: DEMO_QUEUE_PREFIX } } });
  await prisma.appointment.deleteMany({ where: { id: { startsWith: DEMO_APPT_PREFIX } } });
}

export async function seedDemoData(prisma: PrismaClient, ctx: DemoSeedContext): Promise<void> {
  console.log("Seeding demo queues & appointments...");

  await clearDemoData(prisma);

  const { patients, doctors, departments, schedules } = ctx;
  const doctorsByDept = new Map<string, Doctor[]>();
  for (const doc of doctors) {
    if (!doc.departmentId) continue;
    const list = doctorsByDept.get(doc.departmentId) ?? [];
    list.push(doc);
    doctorsByDept.set(doc.departmentId, list);
  }

  const scheduleByDoctorDay = new Map<string, ScheduleRef>();
  for (const s of schedules) {
    scheduleByDoctorDay.set(`${s.doctorId}_${s.dayOfWeek}`, s);
  }

  const queueRows: Prisma.QueueCreateManyInput[] = [];
  const counters = new Map<string, number>();
  let globalIndex = 0;

  for (let dayIdx = 0; dayIdx < DEMO_DATE_ISOS.length; dayIdx++) {
    const dateIso = DEMO_DATE_ISOS[dayIdx]!;
    const countForDay = QUEUES_PER_DAY[dayIdx]!;
    const dow = dayOfWeekForDate(dateIso);

    for (let i = 0; i < countForDay; i++) {
      const dept = departments[globalIndex % departments.length]!;
      const deptDoctors = doctorsByDept.get(dept.id) ?? doctors;
      const doctor = deptDoctors[globalIndex % deptDoctors.length]!;
      const patient = patients[globalIndex % patients.length]!;

      const counterKey = `${dept.id}_${dateIso}`;
      const queueNumber = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, queueNumber);

      const status = pickQueueStatus(dateIso, globalIndex);
      const hasPharmacy = status === QueueStatus.DONE && globalIndex % 3 === 0;
      const ts = timestampsForQueue(dateIso, status, globalIndex);
      const schedule = scheduleByDoctorDay.get(`${doctor.id}_${dow}`);

      const diagnosisIdx = globalIndex % DIAGNOSES.length;
      const medIdx = globalIndex % MEDICATIONS.length;

      queueRows.push({
        id: queueDemoId(dateIso, dept.code, queueNumber),
        patientId: patient.id,
        departmentId: dept.id,
        doctorId: doctor.id,
        scheduleId: schedule?.id ?? null,
        queueNumber,
        status,
        queueDate: parseDateOnly(dateIso),
        checkInAt: ts.checkInAt,
        calledAt: ts.calledAt,
        startedAt: ts.startedAt,
        finishedAt: ts.finishedAt,
        cancelledAt: ts.cancelledAt,
        estimatedWaitMinutes: (queueNumber - 1) * (doctor.avgServiceMin ?? 10),
        actualWaitMinutes: ts.actualWaitMinutes,
        notes: globalIndex % 11 === 0 ? "Pasien walk-in, tanpa reservasi" : null,
        doctorDiagnosis: status === QueueStatus.DONE ? DIAGNOSES[diagnosisIdx] : null,
        doctorMedicationInstructions:
          status === QueueStatus.DONE ? MEDICATIONS[medIdx] : null,
        doctorAdvice: status === QueueStatus.DONE ? ADVICE[globalIndex % ADVICE.length] : null,
        currentVisitStage: visitStageForStatus(status, hasPharmacy),
        pharmacyRequired: hasPharmacy,
        adminArrivedAt: ts.adminArrivedAt,
        pharmacyCompletedAt: ts.pharmacyCompletedAt,
        visitCompletedAt: ts.visitCompletedAt,
        createdAt: ts.checkInAt,
        updatedAt: ts.finishedAt ?? ts.checkInAt,
      });

      globalIndex++;
    }
  }

  // Batch insert queues (300 rows)
  const BATCH = 100;
  for (let i = 0; i < queueRows.length; i += BATCH) {
    await prisma.queue.createMany({ data: queueRows.slice(i, i + BATCH) });
  }

  // Bills for DONE queues
  const doneQueues = queueRows.filter((q) => q.status === QueueStatus.DONE);
  const paymentTypes: PaymentType[] = [
    PaymentType.BPJS,
    PaymentType.UMUM,
    PaymentType.ASURANSI_SWASTA,
  ];
  const billStatuses: BillStatus[] = [BillStatus.PAID, BillStatus.PENDING, BillStatus.BPJS_PENDING, BillStatus.WAIVED];

  const billCreates: Prisma.BillCreateManyInput[] = [];
  const lineItemCreates: Prisma.BillLineItemCreateManyInput[] = [];

  for (let i = 0; i < doneQueues.length; i++) {
    const q = doneQueues[i]!;
    const consultationFee = 50_000 + (i % 4) * 10_000;
    const adminFee = 10_000;
    const pharmacyFee = q.pharmacyRequired ? 25_000 : 0;
    const totalAmount = consultationFee + adminFee + pharmacyFee;
    const paymentType = paymentTypes[i % paymentTypes.length]!;
    const billStatus = billStatuses[i % billStatuses.length]!;
    const billId = billDemoId(q.id as string);
    const patientShare =
      paymentType === PaymentType.BPJS ? 0 : paymentType === PaymentType.ASURANSI_SWASTA ? Math.round(totalAmount * 0.2) : totalAmount;

    billCreates.push({
      id: billId,
      patientId: q.patientId,
      queueId: q.id as string,
      paymentType,
      status: billStatus,
      totalAmount,
      patientShare,
      paidAt: billStatus === BillStatus.PAID ? (q.finishedAt as Date) : null,
      dueDate: new Date(parseDateOnly(ANCHOR_TODAY).getTime() + 14 * 86_400_000),
      createdAt: q.finishedAt as Date,
      updatedAt: q.finishedAt as Date,
    });

    lineItemCreates.push({
      billId,
      description: "Konsultasi poliklinik",
      quantity: 1,
      unitPrice: consultationFee,
      amount: consultationFee,
    });
    lineItemCreates.push({
      billId,
      description: "Biaya administrasi",
      quantity: 1,
      unitPrice: adminFee,
      amount: adminFee,
    });
    if (pharmacyFee > 0) {
      lineItemCreates.push({
        billId,
        description: "Obat resep",
        quantity: 1,
        unitPrice: pharmacyFee,
        amount: pharmacyFee,
      });
    }
  }

  for (let i = 0; i < billCreates.length; i += BATCH) {
    await prisma.bill.createMany({ data: billCreates.slice(i, i + BATCH) });
  }
  for (let i = 0; i < lineItemCreates.length; i += BATCH) {
    await prisma.billLineItem.createMany({ data: lineItemCreates.slice(i, i + BATCH) });
  }

  // Appointments (beyond the 300 walk-in queues; COMPLETED = successful check-in)
  const appointmentRows: Prisma.AppointmentCreateManyInput[] = [];
  const doneQueuesByPatientDate = new Map<string, string>();
  for (const q of queueRows) {
    if (q.status === QueueStatus.DONE) {
      const key = `${q.patientId}_${(q.queueDate as Date).toISOString().slice(0, 10)}`;
      doneQueuesByPatientDate.set(key, q.id as string);
    }
  }

  for (let i = 0; i < TOTAL_APPOINTMENTS; i++) {
    const inWindow = i < APPT_IN_WINDOW;
    let scheduledAt: Date;
    if (inWindow) {
      const dateIso = DEMO_DATE_ISOS[i % DEMO_DATE_ISOS.length]!;
      const hour = 9 + (i % 5);
      scheduledAt = parseDateOnly(dateIso);
      scheduledAt.setUTCHours(hour, (i * 11) % 60, 0, 0);
    } else {
      // May 28 – Jun 10, 2026
      const dayOffset = 4 + (i % 14);
      scheduledAt = parseDateOnly(ANCHOR_TODAY);
      scheduledAt.setUTCDate(scheduledAt.getUTCDate() + dayOffset);
      scheduledAt.setUTCHours(9 + (i % 4), (i * 13) % 60, 0, 0);
    }

    const dept = departments[i % departments.length]!;
    const deptDoctors = doctorsByDept.get(dept.id) ?? doctors;
    const doctor = deptDoctors[i % deptDoctors.length]!;
    const patient = patients[i % patients.length]!;
    const scheduledIso = scheduledAt.toISOString();
    const status = pickAppointmentStatus(i, scheduledIso);
    const dow = dayOfWeekForDate(scheduledIso.slice(0, 10));
    const schedule = scheduleByDoctorDay.get(`${doctor.id}_${dow}`);
    const apptId = apptDemoId(i);

    appointmentRows.push({
      id: apptId,
      patientId: patient.id,
      doctorId: doctor.id,
      departmentId: dept.id,
      scheduleId: schedule?.id ?? null,
      scheduledAt,
      status,
      notes:
        status === AppointmentStatus.COMPLETED
          ? `Check-in sukses — antrean ${doneQueuesByPatientDate.get(`${patient.id}_${scheduledAt.toISOString().slice(0, 10)}`) ?? "terbit"}`
          : status === AppointmentStatus.CANCELLED
            ? "Dibatalkan pasien"
            : null,
      cancellationReason:
        status === AppointmentStatus.CANCELLED ? "Pasien berhalangan hadir" : null,
      createdAt: new Date(scheduledAt.getTime() - 3 * 86_400_000),
      updatedAt: scheduledAt,
    });

  }

  for (let i = 0; i < appointmentRows.length; i += BATCH) {
    await prisma.appointment.createMany({ data: appointmentRows.slice(i, i + BATCH) });
  }

  // Summary stats
  const queueCount = await prisma.queue.count({
    where: { queueDate: { gte: parseDateOnly(DEMO_DATE_ISOS[0]), lte: parseDateOnly(DEMO_DATE_ISOS[3]) } },
  });
  const apptCount = await prisma.appointment.count({ where: { id: { startsWith: DEMO_APPT_PREFIX } } });
  const billCount = await prisma.bill.count({ where: { id: { startsWith: DEMO_BILL_PREFIX } } });

  const statusGroups = await prisma.queue.groupBy({
    by: ["status"],
    where: { id: { startsWith: DEMO_QUEUE_PREFIX } },
    _count: true,
  });
  const dateGroups = await prisma.queue.groupBy({
    by: ["queueDate"],
    where: { id: { startsWith: DEMO_QUEUE_PREFIX } },
    _count: true,
  });
  const apptStatusGroups = await prisma.appointment.groupBy({
    by: ["status"],
    where: { id: { startsWith: DEMO_APPT_PREFIX } },
    _count: true,
  });

  console.log("\nDemo seed summary:");
  console.log(`- Queues in window (incl. appt-linked): ${queueCount}`);
  console.log(`- Demo-tagged queues: ${queueRows.length}`);
  console.log(`- Appointments: ${apptCount}`);
  console.log(`- Bills (DONE queues): ${billCount}`);
  console.log("- Queue status:", Object.fromEntries(statusGroups.map((g) => [g.status, g._count])));
  console.log(
    "- Queue by date:",
    Object.fromEntries(
      dateGroups.map((g) => [g.queueDate.toISOString().slice(0, 10), g._count]).sort(),
    ),
  );
  console.log(
    "- Appointment status:",
    Object.fromEntries(apptStatusGroups.map((g) => [g.status, g._count])),
  );
}
