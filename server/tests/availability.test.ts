import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { subtractIntervals } from "../src/lib/intervals.js";
import {
  appointmentsToBusyIntervals,
  rulesToIntervals,
} from "../src/lib/availability.js";

describe("subtractIntervals", () => {
  it("removes blocked ranges from base intervals", () => {
    const base = [
      {
        start: new Date("2025-02-24T09:00:00.000Z"),
        end: new Date("2025-02-24T17:00:00.000Z"),
      },
    ];
    const blocks = [
      {
        start: new Date("2025-02-24T12:00:00.000Z"),
        end: new Date("2025-02-24T13:00:00.000Z"),
      },
    ];

    const result = subtractIntervals(base, blocks);

    expect(result).toHaveLength(2);
    expect(result[0].start.toISOString()).toBe("2025-02-24T09:00:00.000Z");
    expect(result[0].end.toISOString()).toBe("2025-02-24T12:00:00.000Z");
    expect(result[1].start.toISOString()).toBe("2025-02-24T13:00:00.000Z");
    expect(result[1].end.toISOString()).toBe("2025-02-24T17:00:00.000Z");
  });
});

describe("rulesToIntervals", () => {
  it("builds intervals for matching weekday", () => {
    const timezone = "America/Chicago";
    const dayStart = DateTime.fromISO("2025-02-24", { zone: timezone })
      .startOf("day")
      .toJSDate();
    const dayEnd = DateTime.fromISO("2025-02-24", { zone: timezone })
      .endOf("day")
      .toJSDate();

    const intervals = rulesToIntervals(
      [
        {
          weekday: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      dayStart,
      dayEnd,
      timezone
    );

    expect(intervals).toHaveLength(1);
    expect(intervals[0].start.toISOString()).toContain("T15:00:00.000Z");
    expect(intervals[0].end.toISOString()).toContain("T23:00:00.000Z");
  });
});

describe("appointmentsToBusyIntervals", () => {
  it("applies buffers around appointments", () => {
    const start = new Date("2025-02-24T10:00:00.000Z");
    const end = new Date("2025-02-24T11:00:00.000Z");

    const result = appointmentsToBusyIntervals(
      [{ startAt: start, endAt: end }],
      15,
      10
    );

    expect(result).toHaveLength(1);
    expect(result[0].start.toISOString()).toBe("2025-02-24T09:45:00.000Z");
    expect(result[0].end.toISOString()).toBe("2025-02-24T11:10:00.000Z");
  });
});
