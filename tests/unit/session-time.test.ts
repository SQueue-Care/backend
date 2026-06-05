import { describe, expect, it } from "vitest";
import {
  getWibHour,
  resolveEffectiveArrivalHour,
  resolveEffectiveSessionStartAt,
  resolveSessionStartAt,
} from "../../src/modules/queues/session-time";

/** UTC instant for a WIB clock on a calendar date (WIB = UTC+7). */
function wibInstant(dateKey: string, hour: number, minute = 0): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, hour - 7, minute, 0));
}

describe("resolveEffectiveSessionStartAt", () => {
  const queueDate = new Date("2026-06-04T12:00:00.000Z");
  const openingTime = "08:00";

  it("uses opening time when patient registers before clinic opens on the same day", () => {
    const registerAt = wibInstant("2026-06-04", 4);
    const effective = resolveEffectiveSessionStartAt(queueDate, openingTime, registerAt);
    const opening = resolveSessionStartAt(queueDate, openingTime);

    expect(effective.toISOString()).toBe(opening.toISOString());
    expect(getWibHour(effective)).toBe(8);
  });

  it("uses current time when patient registers after clinic opens on the same day", () => {
    const registerAt = wibInstant("2026-06-04", 10, 15);
    const effective = resolveEffectiveSessionStartAt(queueDate, openingTime, registerAt);

    expect(effective.toISOString()).toBe(registerAt.toISOString());
    expect(getWibHour(effective)).toBe(10);
  });

  it("uses opening time for future booking dates", () => {
    const futureQueueDate = new Date("2026-06-10T12:00:00.000Z");
    const registerAt = wibInstant("2026-06-04", 10);
    const effective = resolveEffectiveSessionStartAt(futureQueueDate, openingTime, registerAt);
    const opening = resolveSessionStartAt(futureQueueDate, openingTime);

    expect(effective.toISOString()).toBe(opening.toISOString());
  });
});

describe("resolveEffectiveArrivalHour", () => {
  const queueDate = new Date("2026-06-04T12:00:00.000Z");
  const openingTime = "08:00";

  it("returns opening hour when registering before clinic opens", () => {
    const registerAt = wibInstant("2026-06-04", 4);
    expect(resolveEffectiveArrivalHour(queueDate, openingTime, registerAt)).toBe(8);
  });

  it("returns current hour when registering during clinic hours", () => {
    const registerAt = wibInstant("2026-06-04", 10);
    expect(resolveEffectiveArrivalHour(queueDate, openingTime, registerAt)).toBe(10);
  });

  it("returns current hour when no schedule is selected", () => {
    const registerAt = wibInstant("2026-06-04", 14);
    expect(resolveEffectiveArrivalHour(queueDate, null, registerAt)).toBe(14);
  });
});
