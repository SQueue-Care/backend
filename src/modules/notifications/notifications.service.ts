import {
  AnnouncementCategory,
  NotificationType,
  QueueStatus,
  Role,
  TargetRole,
  VisitStage,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  ListNotificationsQuery,
  UpdateAnnouncementInput,
} from "./notifications.schema";

type NotificationMetadata = Record<string, unknown>;

function serializeNotification(n: {
  id: string;
  userId: string | null;
  role: TargetRole | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}) {
  return {
    id: n.id,
    userId: n.userId,
    role: n.role,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    metadata: n.metadata,
    createdAt: n.createdAt.toISOString(),
    isRead: n.readAt !== null,
  };
}

function serializeAnnouncement(a: {
  id: string;
  title: string;
  body: string;
  priority: string;
  category: AnnouncementCategory;
  targetRole: TargetRole;
  activeFrom: Date;
  activeTo: Date | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    category: a.category.toLowerCase(),
    targetRole: a.targetRole,
    activeFrom: a.activeFrom.toISOString(),
    activeTo: a.activeTo?.toISOString() ?? null,
    isActive: a.isActive,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function roleToTargetRole(role: Role): TargetRole {
  if (role === Role.PATIENT) return TargetRole.PATIENT;
  if (role === Role.DOCTOR) return TargetRole.DOCTOR;
  return TargetRole.ADMIN;
}

function matchesTargetRole(userRole: Role, target: TargetRole): boolean {
  if (target === TargetRole.ALL) return true;
  return roleToTargetRole(userRole) === target;
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: NotificationMetadata;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return serializeNotification(notification);
}

async function fanOutToUsers(
  users: { id: string; role: Role }[],
  input: {
    type: NotificationType;
    title: string;
    message: string;
    linkForRole?: (role: Role) => string;
    metadata?: NotificationMetadata;
  },
) {
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.linkForRole?.(u.role),
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    })),
  });
}

function announcementLinkForRole(role: Role): string {
  if (role === Role.DOCTOR) return "/doctor/notifications";
  if (role === Role.ADMIN) return "/admin/announcements";
  return "/portal/announcements";
}

export async function fanOutAnnouncementNotifications(announcement: {
  id: string;
  title: string;
  body: string;
  targetRole: TargetRole;
  category: AnnouncementCategory;
}) {
  const roleFilter =
    announcement.targetRole === TargetRole.ALL
      ? undefined
      : (announcement.targetRole as Role);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(roleFilter ? { role: roleFilter } : {}),
    },
    select: { id: true, role: true },
  });

  await fanOutToUsers(users, {
    type: NotificationType.GLOBAL,
    title: announcement.title,
    message: announcement.body,
    linkForRole: announcementLinkForRole,
    metadata: {
      announcementId: announcement.id,
      category: announcement.category.toLowerCase(),
    },
  });
}

const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  WAITING: "Menunggu",
  CALLED: "Dipanggil",
  IN_PROGRESS: "Sedang Diperiksa",
  DONE: "Selesai",
  SKIPPED: "Dilewati",
  CANCELLED: "Dibatalkan",
};

export async function notifyQueueStatusChange(
  queue: {
    id: string;
    queueNumber: number;
    status: QueueStatus;
    patientId: string;
    doctorId: string | null;
    department?: { name: string } | null;
  },
  previousStatus: QueueStatus,
) {
  if (queue.status === previousStatus) return;

  const patient = await prisma.patient.findUnique({
    where: { id: queue.patientId },
    select: { userId: true },
  });
  if (!patient) return;

  const deptName = queue.department?.name ?? "poliklinik";
  const statusLabel = QUEUE_STATUS_LABELS[queue.status];
  const link =
    queue.status === QueueStatus.CANCELLED
      ? "/portal/visits?tab=queues"
      : `/portal/queues/${queue.id}`;

  let title = "Status Antrean Diperbarui";
  let message = `Nomor antrean ${queue.queueNumber} (${deptName}): ${statusLabel}.`;

  switch (queue.status) {
    case QueueStatus.CALLED:
      title = "Giliran Anda!";
      message = `Nomor antrean ${queue.queueNumber} di ${deptName} dipanggil. Silakan menuju ruang pemeriksaan.`;
      break;
    case QueueStatus.IN_PROGRESS:
      title = "Pemeriksaan Dimulai";
      message = `Dokter mulai memeriksa antrean nomor ${queue.queueNumber} di ${deptName}.`;
      break;
    case QueueStatus.DONE:
      title = "Pemeriksaan Selesai";
      message = `Pemeriksaan antrean nomor ${queue.queueNumber} selesai. Silakan lanjut ke tahap administrasi/tagihan.`;
      break;
    case QueueStatus.CANCELLED:
      title = "Antrean Dibatalkan";
      message = `Antrean nomor ${queue.queueNumber} di ${deptName} telah dibatalkan.`;
      break;
    case QueueStatus.SKIPPED:
      title = "Antrean Dilewati";
      message = `Antrean nomor ${queue.queueNumber} dilewati sementara. Silakan menunggu panggilan ulang.`;
      break;
    default:
      break;
  }

  await createNotification({
    userId: patient.userId,
    type: NotificationType.QUEUE_STATUS,
    title,
    message,
    link,
    metadata: { queueId: queue.id, status: queue.status, queueNumber: queue.queueNumber },
  });

  if (
    queue.doctorId &&
    (queue.status === QueueStatus.CALLED || queue.status === QueueStatus.IN_PROGRESS)
  ) {
    const doctor = await prisma.doctor.findUnique({
      where: { id: queue.doctorId },
      select: { userId: true },
    });
    if (doctor) {
      await createNotification({
        userId: doctor.userId,
        type: NotificationType.QUEUE_STATUS,
        title: "Pasien Aktif",
        message: `Antrean nomor ${queue.queueNumber} (${deptName}) — status: ${statusLabel}.`,
        link: "/doctor/queues",
        metadata: { queueId: queue.id, status: queue.status },
      });
    }
  }
}

export async function notifyVisitStageChange(
  queue: {
    id: string;
    queueNumber: number;
    patientId: string;
    currentVisitStage: VisitStage;
    department?: { name: string } | null;
  },
  action: string,
) {
  const patient = await prisma.patient.findUnique({
    where: { id: queue.patientId },
    select: { userId: true },
  });
  if (!patient) return;

  const deptName = queue.department?.name ?? "poliklinik";
  let title = "Tahap Kunjungan Diperbarui";
  let message = `Kunjungan antrean ${queue.queueNumber} di ${deptName} memasuki tahap baru.`;

  if (action === "ADMIN_ARRIVED") {
    title = "Tahap Administrasi";
    message = `Anda telah tiba di loket administrasi untuk antrean ${queue.queueNumber}.`;
  } else if (action === "PHARMACY_COMPLETE") {
    title = "Kunjungan Selesai";
    message = `Pengambilan obat selesai. Kunjungan antrean ${queue.queueNumber} telah selesai. Terima kasih.`;
  }

  await createNotification({
    userId: patient.userId,
    type: NotificationType.QUEUE_STATUS,
    title,
    message,
    link: `/portal/queues/${queue.id}`,
    metadata: {
      queueId: queue.id,
      visitStage: queue.currentVisitStage,
      action,
    },
  });
}

export async function notifyBillCreated(bill: {
  id: string;
  patientId: string;
  totalAmount: number;
  patientShare: number | null;
  queueId: string | null;
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: bill.patientId },
    select: { userId: true },
  });
  if (!patient) return;

  const share = bill.patientShare ?? bill.totalAmount;
  const formatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(share);

  await createNotification({
    userId: patient.userId,
    type: NotificationType.BILLING,
    title: "Tagihan Baru",
    message: `Tagihan kunjungan sebesar ${formatted} telah dibuat. Silakan lakukan pembayaran sebelum jatuh tempo.`,
    link: "/portal/billing",
    metadata: { billId: bill.id, queueId: bill.queueId },
  });
}

export async function notifyBillPaid(bill: {
  id: string;
  patientId: string;
  totalAmount: number;
  patientShare: number | null;
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: bill.patientId },
    select: { userId: true },
  });
  if (!patient) return;

  await createNotification({
    userId: patient.userId,
    type: NotificationType.BILLING,
    title: "Pembayaran Berhasil",
    message: "Tagihan kunjungan Anda telah lunas. Terima kasih.",
    link: "/portal/billing",
    metadata: { billId: bill.id },
  });
}

export async function listNotifications(actor: Express.UserPayload, query: ListNotificationsQuery) {
  const where: Prisma.NotificationWhereInput = {
    userId: actor.id,
    ...(query.unreadOnly ? { readAt: null } : {}),
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
    }),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);

  return {
    items: items.map(serializeNotification),
    unreadCount,
  };
}

export async function markNotificationRead(id: string, actor: Express.UserPayload) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new NotFoundError("Notifikasi tidak ditemukan");
  if (notification.userId !== actor.id) {
    throw new ForbiddenError("Akses notifikasi ditolak");
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  return serializeNotification(updated);
}

export async function markAllNotificationsRead(actor: Express.UserPayload) {
  const result = await prisma.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

export async function listAnnouncements(query: ListAnnouncementsQuery, actor?: Express.UserPayload) {
  const now = new Date();
  const isAdmin = actor?.role === Role.ADMIN;

  const where: Prisma.AnnouncementWhereInput = isAdmin && query.includeInactive
    ? {}
    : {
        isActive: true,
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gte: now } }],
      };

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: [{ priority: "desc" }, { activeFrom: "desc" }],
  });

  const filtered = actor
    ? announcements.filter((a) => matchesTargetRole(actor.role, a.targetRole))
    : announcements;

  return filtered.map(serializeAnnouncement);
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  actor: Express.UserPayload,
) {
  if (input.activeTo && input.activeFrom && input.activeTo < input.activeFrom) {
    throw new BadRequestError("Tanggal berakhir harus setelah tanggal mulai");
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      priority: input.priority,
      category: input.category,
      targetRole: input.targetRole,
      activeFrom: input.activeFrom ?? new Date(),
      activeTo: input.activeTo ?? null,
      isActive: input.isActive,
      createdById: actor.id,
    },
  });

  if (input.notifyUsers && input.isActive) {
    try {
      await fanOutAnnouncementNotifications(announcement);
    } catch (err) {
      console.error("[notifications] Gagal fan-out pengumuman:", err);
    }
  }

  return serializeAnnouncement(announcement);
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
  actor: Express.UserPayload,
) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Pengumuman tidak ditemukan");

  const activeFrom = input.activeFrom ?? existing.activeFrom;
  const activeTo = input.activeTo !== undefined ? input.activeTo : existing.activeTo;
  if (activeTo && activeTo < activeFrom) {
    throw new BadRequestError("Tanggal berakhir harus setelah tanggal mulai");
  }

  const wasInactive = !existing.isActive;
  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.targetRole !== undefined ? { targetRole: input.targetRole } : {}),
      ...(input.activeFrom !== undefined ? { activeFrom: input.activeFrom } : {}),
      ...(input.activeTo !== undefined ? { activeTo: input.activeTo } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  const becameActive = wasInactive && announcement.isActive && input.notifyUsers !== false;
  if (becameActive) {
    try {
      await fanOutAnnouncementNotifications(announcement);
    } catch (err) {
      console.error("[notifications] Gagal fan-out pengumuman:", err);
    }
  }

  return serializeAnnouncement(announcement);
}

export async function deleteAnnouncement(id: string) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Pengumuman tidak ditemukan");
  await prisma.announcement.delete({ where: { id } });
}
