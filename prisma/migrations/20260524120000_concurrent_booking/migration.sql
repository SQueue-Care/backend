-- Concurrent booking: department daily quota + per-schedule per-day capacity counters

-- AlterTable
ALTER TABLE "Department" ADD COLUMN "dailyBookingQuota" INTEGER NOT NULL DEFAULT 200;

-- CreateTable
CREATE TABLE "ScheduleDayCapacity" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleDayCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentDayCapacity" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentDayCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDayCapacity_scheduleId_bookingDate_key" ON "ScheduleDayCapacity"("scheduleId", "bookingDate");

-- CreateIndex
CREATE INDEX "ScheduleDayCapacity_bookingDate_idx" ON "ScheduleDayCapacity"("bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentDayCapacity_departmentId_bookingDate_key" ON "DepartmentDayCapacity"("departmentId", "bookingDate");

-- CreateIndex
CREATE INDEX "DepartmentDayCapacity_bookingDate_idx" ON "DepartmentDayCapacity"("bookingDate");

-- Partial unique: satu antrian aktif per pasien per poli per hari
CREATE UNIQUE INDEX "Queue_active_patient_dept_day_key"
ON "Queue"("patientId", "departmentId", "queueDate")
WHERE status IN ('WAITING', 'CALLED', 'IN_PROGRESS');

-- AddForeignKey
ALTER TABLE "ScheduleDayCapacity" ADD CONSTRAINT "ScheduleDayCapacity_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentDayCapacity" ADD CONSTRAINT "DepartmentDayCapacity_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill counters from existing active bookings
INSERT INTO "ScheduleDayCapacity" ("id", "scheduleId", "bookingDate", "bookedCount", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "scheduleId",
  "bookingDate",
  SUM(cnt)::int,
  NOW(),
  NOW()
FROM (
  SELECT "scheduleId", "queueDate" AS "bookingDate", COUNT(*)::int AS cnt
  FROM "Queue"
  WHERE "scheduleId" IS NOT NULL
    AND status NOT IN ('CANCELLED', 'SKIPPED')
  GROUP BY "scheduleId", "queueDate"
  UNION ALL
  SELECT "scheduleId", DATE("scheduledAt" AT TIME ZONE 'UTC') AS "bookingDate", COUNT(*)::int AS cnt
  FROM "Appointment"
  WHERE "scheduleId" IS NOT NULL
    AND status IN ('BOOKED', 'CONFIRMED')
  GROUP BY "scheduleId", DATE("scheduledAt" AT TIME ZONE 'UTC')
) combined
GROUP BY "scheduleId", "bookingDate"
ON CONFLICT ("scheduleId", "bookingDate") DO UPDATE
SET "bookedCount" = EXCLUDED."bookedCount",
    "updatedAt" = NOW();

INSERT INTO "DepartmentDayCapacity" ("id", "departmentId", "bookingDate", "bookedCount", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "departmentId",
  "bookingDate",
  SUM(cnt)::int,
  NOW(),
  NOW()
FROM (
  SELECT "departmentId", "queueDate" AS "bookingDate", COUNT(*)::int AS cnt
  FROM "Queue"
  WHERE status NOT IN ('CANCELLED', 'SKIPPED')
  GROUP BY "departmentId", "queueDate"
  UNION ALL
  SELECT "departmentId", DATE("scheduledAt" AT TIME ZONE 'UTC') AS "bookingDate", COUNT(*)::int AS cnt
  FROM "Appointment"
  WHERE status IN ('BOOKED', 'CONFIRMED')
  GROUP BY "departmentId", DATE("scheduledAt" AT TIME ZONE 'UTC')
) combined
GROUP BY "departmentId", "bookingDate"
ON CONFLICT ("departmentId", "bookingDate") DO UPDATE
SET "bookedCount" = EXCLUDED."bookedCount",
    "updatedAt" = NOW();
