import { describe, expect, it } from "vitest";
import { tryReserveSlot } from "../../src/modules/booking/booking-capacity";

/** Simulates atomic slot reservation with a mutex (mirrors Serializable transaction). */
class AtomicSlotCounter {
  private bookedCount = 0;
  private chain: Promise<void> = Promise.resolve();

  get booked(): number {
    return this.bookedCount;
  }

  async tryReserve(maxCapacity: number): Promise<"ok" | "full"> {
    let outcome: "ok" | "full" = "full";

    const run = async () => {
      if (tryReserveSlot(this.bookedCount, maxCapacity) === "full") {
        outcome = "full";
        return;
      }
      this.bookedCount += 1;
      outcome = "ok";
    };

    this.chain = this.chain.then(run, run);
    await this.chain;
    return outcome;
  }
}

describe("concurrent booking capacity", () => {
  it("tryReserveSlot rejects when at capacity", () => {
    expect(tryReserveSlot(1, 1)).toBe("full");
    expect(tryReserveSlot(0, 1)).toBe("ok");
  });

  it("allows only one booking when one slot remains under concurrent load", async () => {
    const counter = new AtomicSlotCounter();
    const maxCapacity = 1;

    const results = await Promise.all([
      counter.tryReserve(maxCapacity),
      counter.tryReserve(maxCapacity),
      counter.tryReserve(maxCapacity),
    ]);

    const successes = results.filter((r) => r === "ok");
    const failures = results.filter((r) => r === "full");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(2);
    expect(counter.booked).toBe(1);
  });

  it("allows N bookings when capacity is N", async () => {
    const counter = new AtomicSlotCounter();
    const maxCapacity = 3;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => counter.tryReserve(maxCapacity)),
    );

    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    expect(results.filter((r) => r === "full")).toHaveLength(2);
    expect(counter.booked).toBe(3);
  });
});
