import { describe, expect, it } from "vitest";
import { isNeonOutboxSlot } from "../../src/notifications/outbox-schedule";

describe("isNeonOutboxSlot", () => {
  it.each(["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"])(
    "is true at %s UTC",
    (time) => {
      expect(isNeonOutboxSlot(new Date(`2026-11-15T${time}:00.000Z`))).toBe(true);
    },
  );

  it.each(["00:05", "03:30", "01:00", "02:00", "04:00", "20:00", "23:55"])(
    "is false at %s UTC",
    (time) => {
      expect(isNeonOutboxSlot(new Date(`2026-11-15T${time}:00.000Z`))).toBe(false);
    },
  );

  it("fires exactly 8 times per day on the 5-minute cron", () => {
    const start = Date.parse("2026-11-15T00:00:00.000Z");
    let hits = 0;
    for (let i = 0; i < 24 * 12; i++) {
      if (isNeonOutboxSlot(new Date(start + i * 5 * 60_000))) hits++;
    }
    expect(hits).toBe(8);
  });
});
