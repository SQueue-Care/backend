import { toBookingDate } from "../booking/booking-capacity";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

type StoredPredictionFeatures = {
  sessionStartAt?: string;
  estimatedCallAt?: string;
};

function bookingDateKey(queueDate: Date): string {
  return toBookingDate(queueDate).toISOString().split("T")[0] ?? "";
}

/** Jam (0–23) dalam zona WIB untuk timestamp UTC. */
export function getWibHour(date: Date): number {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return wib.getUTCHours();
}

/** Tanggal kalender WIB sebagai YYYY-MM-DD. */
export function getWibDateKey(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wib.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Waktu efektif mulai antrian: max(sekarang, jam buka) untuk hari yang sama,
 * atau jam buka untuk tanggal booking di masa depan/lalu.
 */
export function resolveEffectiveSessionStartAt(
  queueDate: Date,
  startTime: string,
  referenceNow = new Date(),
): Date {
  const sessionOpening = resolveSessionStartAt(queueDate, startTime);
  if (bookingDateKey(queueDate) !== getWibDateKey(referenceNow)) {
    return sessionOpening;
  }

  return referenceNow > sessionOpening ? referenceNow : sessionOpening;
}

/** Jam kedatangan efektif untuk prediksi ML (WIB, 0–23). */
export function resolveEffectiveArrivalHour(
  queueDate: Date,
  startTime: string | null | undefined,
  referenceNow = new Date(),
): number {
  if (!startTime) {
    return getWibHour(referenceNow);
  }

  return getWibHour(resolveEffectiveSessionStartAt(queueDate, startTime, referenceNow));
}

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
  checkInAt?: Date;
  createdAt?: Date;
  schedule?: { startTime: string } | null;
  estimatedWaitMinutes?: number | null;
  prediction?: { estimatedMin: number; features?: unknown } | null;
}): {
  sessionStartAt: string | null;
  estimatedCallAt: string | null;
  sessionStartTime: string | null;
} {
  const startTime = queue.schedule?.startTime ?? null;
  if (!startTime) {
    return { sessionStartAt: null, estimatedCallAt: null, sessionStartTime: null };
  }

  const storedFeatures = queue.prediction?.features as StoredPredictionFeatures | null | undefined;
  if (storedFeatures?.sessionStartAt) {
    return {
      sessionStartAt: storedFeatures.sessionStartAt,
      estimatedCallAt: storedFeatures.estimatedCallAt ?? null,
      sessionStartTime: startTime,
    };
  }

  const referenceNow = queue.checkInAt ?? queue.createdAt ?? new Date();
  const sessionStartAt = resolveEffectiveSessionStartAt(queue.queueDate, startTime, referenceNow);
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
  referenceNow = new Date(),
): {
  sessionStartAt?: string;
  estimatedCallAt?: string;
  sessionStartTime?: string;
} {
  if (!queueDate || !startTime || estimatedMinutes == null) return {};

  const sessionStartAt = resolveEffectiveSessionStartAt(queueDate, startTime, referenceNow);
  const estimatedCallAt = resolveEstimatedCallAt(sessionStartAt, estimatedMinutes);

  return {
    sessionStartAt: sessionStartAt.toISOString(),
    estimatedCallAt: estimatedCallAt.toISOString(),
    sessionStartTime: startTime,
  };
}
