import { QueueStatus } from "@prisma/client";

const ACTIVE_SERVING_STATUSES: QueueStatus[] = [QueueStatus.CALLED, QueueStatus.IN_PROGRESS];

/** Returns true when the doctor already has another active patient. */
export function hasConflictingActivePatient(
  activeQueues: Array<{ id: string; status: QueueStatus }>,
  targetQueueId: string,
): boolean {
  return activeQueues.some(
    (q) => q.id !== targetQueueId && ACTIVE_SERVING_STATUSES.includes(q.status),
  );
}

export function isActiveServingStatus(status: QueueStatus): boolean {
  return ACTIVE_SERVING_STATUSES.includes(status);
}
