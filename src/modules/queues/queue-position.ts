import { QueueStatus, type PrismaClient } from "@prisma/client";

const AHEAD_STATUSES: QueueStatus[] = [
  QueueStatus.WAITING,
  QueueStatus.CALLED,
  QueueStatus.IN_PROGRESS,
];

/** Jumlah pasien aktif dengan nomor antrean lebih kecil (belum selesai dilayani). */
export async function countWaitingAhead(
  db: Pick<PrismaClient, "queue">,
  input: {
    departmentId: string;
    queueDate: Date;
    queueNumber: number;
  },
): Promise<number> {
  return db.queue.count({
    where: {
      departmentId: input.departmentId,
      queueDate: input.queueDate,
      queueNumber: { lt: input.queueNumber },
      status: { in: AHEAD_STATUSES },
    },
  });
}

export function resolveLiveWaitingAhead(
  status: QueueStatus,
  waitingAhead: number,
): number | null {
  if (status !== QueueStatus.WAITING) return null;
  return waitingAhead;
}
