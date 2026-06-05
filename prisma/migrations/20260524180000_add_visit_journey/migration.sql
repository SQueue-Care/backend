-- CreateEnum
CREATE TYPE "VisitStage" AS ENUM ('REGISTRATION', 'WAITING', 'EXAMINATION', 'ADMIN', 'PHARMACY', 'COMPLETE');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "building" TEXT DEFAULT 'Gedung Utama',
ADD COLUMN     "waitingRoomName" TEXT,
ADD COLUMN     "examinationRoom" TEXT,
ADD COLUMN     "adminCounter" TEXT,
ADD COLUMN     "pharmacyLocation" TEXT;

-- AlterTable
ALTER TABLE "Queue" ADD COLUMN     "currentVisitStage" "VisitStage" NOT NULL DEFAULT 'WAITING',
ADD COLUMN     "pharmacyRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminArrivedAt" TIMESTAMP(3),
ADD COLUMN     "pharmacyCompletedAt" TIMESTAMP(3),
ADD COLUMN     "visitCompletedAt" TIMESTAMP(3);

-- Backfill visit stage from existing queue status
UPDATE "Queue" SET "currentVisitStage" = 'EXAMINATION'
WHERE "status" IN ('CALLED', 'IN_PROGRESS');

UPDATE "Queue" SET "currentVisitStage" = 'ADMIN', "pharmacyRequired" = (
  COALESCE(TRIM("doctorMedicationInstructions"), '') <> ''
)
WHERE "status" = 'DONE' AND "visitCompletedAt" IS NULL;

UPDATE "Queue" q SET "currentVisitStage" = 'COMPLETE', "visitCompletedAt" = q."finishedAt"
FROM "Bill" b
WHERE b."queueId" = q."id"
  AND b."status" IN ('PAID', 'WAIVED')
  AND q."status" = 'DONE'
  AND (
    q."pharmacyRequired" = false
    OR q."pharmacyCompletedAt" IS NOT NULL
  );

UPDATE "Queue" q SET "currentVisitStage" = 'PHARMACY'
FROM "Bill" b
WHERE b."queueId" = q."id"
  AND b."status" IN ('PAID', 'WAIVED')
  AND q."status" = 'DONE'
  AND q."pharmacyRequired" = true
  AND q."pharmacyCompletedAt" IS NULL;
