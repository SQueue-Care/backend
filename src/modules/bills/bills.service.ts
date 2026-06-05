import { BillStatus, PaymentType, Prisma, Role } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { advanceQueueAfterPayment } from "../queues/visit-stage";
import { notifyBillCreated, notifyBillPaid } from "../notifications/notifications.service";
import { buildPagination, paginationSkipTake } from "../../utils/pagination";
import type { CreateBillInput, ListBillsQuery, PayBillInput, UpdateBillInput } from "./bills.schema";

const BILL_INCLUDE = {
  lineItems: { orderBy: { id: "asc" as const } },
  patient: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  queue: {
    include: {
      department: true,
      doctor: { include: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.BillInclude;

type BillWithRelations = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

function serializeBill(bill: BillWithRelations) {
  return {
    id: bill.id,
    patientId: bill.patientId,
    queueId: bill.queueId,
    paymentType: bill.paymentType,
    status: bill.status,
    totalAmount: bill.totalAmount,
    patientShare: bill.patientShare,
    sepNumber: bill.sepNumber,
    bpjsNumber: bill.bpjsNumber,
    dueDate: bill.dueDate?.toISOString() ?? null,
    paidAt: bill.paidAt?.toISOString() ?? null,
    notes: bill.notes,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    lineItems: bill.lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    })),
    patient: bill.patient
      ? {
          id: bill.patient.id,
          bpjsNumber: bill.patient.bpjsNumber,
          user: bill.patient.user,
        }
      : null,
    queue: bill.queue
      ? {
          id: bill.queue.id,
          queueNumber: bill.queue.queueNumber,
          queueDate: bill.queue.queueDate.toISOString().slice(0, 10),
          department: bill.queue.department,
          doctor: bill.queue.doctor,
        }
      : null,
  };
}

async function assertBillAccess(bill: { patientId: string }, actor: Express.UserPayload) {
  if (actor.role === Role.ADMIN || actor.role === Role.DOCTOR) return;

  const patient = await prisma.patient.findUnique({ where: { userId: actor.id } });
  if (!patient || patient.id !== bill.patientId) {
    throw new ForbiddenError("Akses tagihan ditolak");
  }
}

async function assertPatientAccess(patientId: string, actor: Express.UserPayload) {
  if (actor.role === Role.ADMIN || actor.role === Role.DOCTOR) return;

  const patient = await prisma.patient.findUnique({ where: { userId: actor.id } });
  if (!patient || patient.id !== patientId) {
    throw new ForbiddenError("Akses data pasien ditolak");
  }
}

function resolvePaymentType(patient: { bpjsNumber: string | null }, override?: PaymentType): PaymentType {
  if (override) return override;
  return patient.bpjsNumber ? PaymentType.BPJS : PaymentType.UMUM;
}

function buildDefaultLineItems(paymentType: PaymentType, departmentName: string) {
  const consultationFee = env.CONSULTATION_FEE_DEFAULT;
  const adminFee = env.ADMIN_FEE_DEFAULT;

  if (paymentType === PaymentType.BPJS) {
    return [
      {
        description: `Konsultasi ${departmentName} (Ditanggung BPJS)`,
        quantity: 1,
        unitPrice: consultationFee,
      },
      {
        description: "Biaya administrasi",
        quantity: 1,
        unitPrice: adminFee,
      },
    ];
  }

  return [
    {
      description: `Konsultasi ${departmentName}`,
      quantity: 1,
      unitPrice: consultationFee,
    },
    {
      description: "Biaya administrasi",
      quantity: 1,
      unitPrice: adminFee,
    },
  ];
}

function computeTotals(
  lineItems: { quantity: number; unitPrice: number }[],
  paymentType: PaymentType,
) {
  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const patientShare =
    paymentType === PaymentType.BPJS ? env.BPJS_COPAY_DEFAULT : totalAmount;
  return { totalAmount, patientShare };
}

export async function createBillForQueue(queueId: string, input?: Partial<CreateBillInput>) {
  const existing = await prisma.bill.findUnique({ where: { queueId } });
  if (existing) return serializeBill(await getBillRecord(existing.id));

  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: {
      department: true,
      patient: true,
    },
  });
  if (!queue) throw new NotFoundError("Antrian tidak ditemukan");

  const paymentType = resolvePaymentType(queue.patient, input?.paymentType);
  const rawItems = input?.lineItems ?? buildDefaultLineItems(paymentType, queue.department.name);
  const { totalAmount, patientShare } = computeTotals(rawItems, paymentType);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const status =
    paymentType === PaymentType.BPJS ? BillStatus.BPJS_PENDING : BillStatus.PENDING;

  const bill = await prisma.bill.create({
    data: {
      patientId: queue.patientId,
      queueId: queue.id,
      paymentType,
      status,
      totalAmount,
      patientShare,
      bpjsNumber: queue.patient.bpjsNumber,
      sepNumber: paymentType === PaymentType.BPJS ? null : null,
      dueDate,
      notes:
        input?.notes ??
        (paymentType === PaymentType.BPJS
          ? "Tagihan ini diverifikasi oleh administrasi. Peserta BPJS biasanya tidak membayar penuh di kasir."
          : "Silakan lakukan pembayaran di loket kasir sebelum batas jatuh tempo."),
      lineItems: {
        create: rawItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
        })),
      },
    },
    include: BILL_INCLUDE,
  });

  try {
    await notifyBillCreated(bill);
  } catch (err) {
    console.error("[notifications] Gagal mengirim notifikasi tagihan baru:", err);
  }

  return serializeBill(bill);
}

async function getBillRecord(id: string): Promise<BillWithRelations> {
  const bill = await prisma.bill.findUnique({ where: { id }, include: BILL_INCLUDE });
  if (!bill) throw new NotFoundError("Tagihan tidak ditemukan");
  return bill;
}

export async function createBill(input: CreateBillInput, actor: Express.UserPayload) {
  if (actor.role !== Role.ADMIN && actor.role !== Role.DOCTOR) {
    throw new ForbiddenError("Hanya staf yang dapat membuat tagihan manual");
  }
  return createBillForQueue(input.queueId, input);
}

export async function listBills(query: ListBillsQuery, actor: Express.UserPayload) {
  if (actor.role !== Role.ADMIN) {
    throw new ForbiddenError("Hanya admin yang dapat melihat semua tagihan");
  }

  const where: Prisma.BillWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.paymentType) where.paymentType = query.paymentType;

  const [items, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paginationSkipTake(query),
      include: BILL_INCLUDE,
    }),
    prisma.bill.count({ where }),
  ]);

  return {
    items: items.map(serializeBill),
    pagination: buildPagination(query.page, query.pageSize, total),
  };
}

export async function listPatientBills(patientId: string, actor: Express.UserPayload) {
  await assertPatientAccess(patientId, actor);

  const bills = await prisma.bill.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    include: BILL_INCLUDE,
  });

  return bills.map(serializeBill);
}

export async function getBill(id: string, actor: Express.UserPayload) {
  const bill = await getBillRecord(id);
  await assertBillAccess(bill, actor);
  return serializeBill(bill);
}

export async function payBill(id: string, input: PayBillInput, actor: Express.UserPayload) {
  const bill = await getBillRecord(id);
  await assertBillAccess(bill, actor);

  if (bill.status === BillStatus.PAID || bill.status === BillStatus.WAIVED) {
    throw new BadRequestError("Tagihan sudah lunas atau dibebaskan");
  }

  const paymentNote =
    input.paymentMethod === "ONLINE_DEMO"
      ? "Pembayaran simulasi online (demo)"
      : actor.role === Role.PATIENT
        ? "Sudah bayar di kasir — konfirmasi pasien"
        : "Dibayar / dikonfirmasi di kasir";

  const noteParts = [bill.notes, input.notes, paymentNote].filter(Boolean);

  const updated = await prisma.bill.update({
    where: { id },
    data: {
      status: BillStatus.PAID,
      paidAt: new Date(),
      notes: noteParts.join("\n"),
    },
    include: BILL_INCLUDE,
  });

  if (updated.queueId) {
    await advanceQueueAfterPayment(updated.queueId);
  }

  try {
    await notifyBillPaid(updated);
  } catch (err) {
    console.error("[notifications] Gagal mengirim notifikasi pembayaran:", err);
  }

  return serializeBill(updated);
}

export async function updateBill(id: string, input: UpdateBillInput, actor: Express.UserPayload) {
  if (actor.role !== Role.ADMIN) {
    throw new ForbiddenError("Hanya admin yang dapat mengubah tagihan");
  }

  const bill = await getBillRecord(id);
  const data: Prisma.BillUpdateInput = {};

  if (input.status) data.status = input.status;
  if (input.sepNumber !== undefined) data.sepNumber = input.sepNumber;
  if (input.notes !== undefined) data.notes = input.notes;

  if (input.lineItems) {
    const totalAmount = input.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    data.totalAmount = totalAmount;
    data.patientShare =
      bill.paymentType === PaymentType.BPJS ? env.BPJS_COPAY_DEFAULT : totalAmount;

    await prisma.billLineItem.deleteMany({ where: { billId: id } });
    await prisma.billLineItem.createMany({
      data: input.lineItems.map((item) => ({
        billId: id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.quantity * item.unitPrice,
      })),
    });
  }

  const updated = await prisma.bill.update({
    where: { id },
    data,
    include: BILL_INCLUDE,
  });

  if (
    input.status &&
    (input.status === BillStatus.PAID || input.status === BillStatus.WAIVED) &&
    updated.queueId
  ) {
    await advanceQueueAfterPayment(updated.queueId);
  }

  return serializeBill(updated);
}
