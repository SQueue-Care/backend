import { QueueStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { hasConflictingActivePatient, isActiveServingStatus } from "../../src/modules/queues/doctor-serving";

describe("doctor serving guard", () => {
  it("detects another active patient for the same doctor", () => {
    const activeQueues = [
      { id: "queue-a", status: QueueStatus.IN_PROGRESS },
      { id: "queue-b", status: QueueStatus.WAITING },
    ];

    expect(hasConflictingActivePatient(activeQueues, "queue-b")).toBe(true);
  });

  it("allows serving when only the target queue is active", () => {
    const activeQueues = [{ id: "queue-a", status: QueueStatus.IN_PROGRESS }];

    expect(hasConflictingActivePatient(activeQueues, "queue-a")).toBe(false);
  });

  it("allows serving when no active patients exist", () => {
    expect(hasConflictingActivePatient([], "queue-a")).toBe(false);
  });

  it("treats CALLED status as active serving", () => {
    const activeQueues = [{ id: "queue-a", status: QueueStatus.CALLED }];

    expect(hasConflictingActivePatient(activeQueues, "queue-b")).toBe(true);
    expect(isActiveServingStatus(QueueStatus.CALLED)).toBe(true);
    expect(isActiveServingStatus(QueueStatus.WAITING)).toBe(false);
  });
});
