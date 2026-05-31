import { toBookingDate } from "../booking/booking-capacity";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Jam praktik disimpan sebagai HH:mm dalam zona WIB. */
export function resolveSessionStartAt(queueDate: Date, startTime: string): Date {
  const bookingDate = toBookingDate(queueDate);
  const dateKey = bookingDate.toISOString().split("T")[0] ?? "";
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = parseInt(hourStr ?? "0", 10);
  const minute = parseInt(minuteStr ?? "0", 10);
  const [year, month, day] = dateKey.split("-").map((part) => parseInt(part, 10));
  if (!year || !month || !day) {
    throw new Error(`Invalid booking date key: ${dateKey}`);
  }

  // Konversi WIB → UTC (WIB = UTC+7)
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0));
}

export function parseSessionStartHour(startTime: string): number {
  return parseInt(startTime.split(":")[0] ?? "0", 10);
}

export function resolveEstimatedCallAt(sessionStartAt: Date, estimatedMinutes: number): Date {
  return new Date(sessionStartAt.getTime() + estimatedMinutes * 60_000);
}

export function resolveQueueSessionMeta(queue: {
  queueDate: Date;
  schedule?: { startTime: string } | null;
  estimatedWaitMinutes?: number | null;
  prediction?: { estimatedMin: number } | null;
}): {
  sessionStartAt: string | null;
  estimatedCallAt: string | null;
  sessionStartTime: string | null;
} {
  const startTime = queue.schedule?.startTime ?? null;
  if (!startTime) {
    return { sessionStartAt: null, estimatedCallAt: null, sessionStartTime: null };
  }

  const sessionStartAt = resolveSessionStartAt(queue.queueDate, startTime);
  const minutes = queue.estimatedWaitMinutes ?? queue.prediction?.estimatedMin ?? null;
  const estimatedCallAt = minutes != null ? resolveEstimatedCallAt(sessionStartAt, minutes) : null;

  return {
    sessionStartAt: sessionStartAt.toISOString(),
    estimatedCallAt: estimatedCallAt?.toISOString() ?? null,
    sessionStartTime: startTime,
  };
}

/** Format jam WIB untuk respons API (HH:mm). */
export function formatWibClock(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const hours = wib.getUTCHours();
  const minutes = wib.getUTCMinutes();
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function resolveSessionMetaFromSchedule(
  queueDate: Date | undefined,
  startTime: string | null | undefined,
  estimatedMinutes: number | null | undefined,
): {
  sessionStartAt?: string;
  estimatedCallAt?: string;
  sessionStartTime?: string;
} {
  if (!queueDate || !startTime || estimatedMinutes == null) return {};

  const sessionStartAt = resolveSessionStartAt(queueDate, startTime);
  const estimatedCallAt = resolveEstimatedCallAt(sessionStartAt, estimatedMinutes);

  return {
    sessionStartAt: sessionStartAt.toISOString(),
    estimatedCallAt: estimatedCallAt.toISOString(),
    sessionStartTime: startTime,
  };
}
