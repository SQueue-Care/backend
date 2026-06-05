import { describe, expect, it } from "vitest";
import { QueueStatus } from "@prisma/client";
import { resolveLiveWaitingAhead } from "../../src/modules/queues/queue-position";

describe("resolveLiveWaitingAhead", () => {
  it("returns count only for WAITING status", () => {
    expect(resolveLiveWaitingAhead(QueueStatus.WAITING, 3)).toBe(3);
    expect(resolveLiveWaitingAhead(QueueStatus.WAITING, 0)).toBe(0);
    expect(resolveLiveWaitingAhead(QueueStatus.CALLED, 0)).toBeNull();
    expect(resolveLiveWaitingAhead(QueueStatus.IN_PROGRESS, 2)).toBeNull();
  });
});
