import { DateTime } from "luxon";
import { Interval } from "./intervals.js";

export type AvailabilityRule = {
  weekday: number; // 0=Sunday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isActive?: boolean;
};

export type AppointmentWindow = {
  startAt: Date;
  endAt: Date;
};

export function rulesToIntervals(
  rules: AvailabilityRule[],
  dayStart: Date,
  dayEnd: Date,
  timezone: string
): Interval[] {
  const dayStartTz = DateTime.fromJSDate(dayStart, { zone: timezone });
  const weekday = dayStartTz.weekday % 7; // Luxon: 1=Mon..7=Sun
  const activeRules = rules.filter(
    (rule) => (rule.isActive ?? true) && rule.weekday === weekday
  );

  return activeRules
    .map((rule) => {
      const [startHour, startMinute] = rule.startTime.split(":").map(Number);
      const [endHour, endMinute] = rule.endTime.split(":").map(Number);

      const start = dayStartTz.set({
        hour: startHour,
        minute: startMinute,
        second: 0,
        millisecond: 0,
      });
      const end = dayStartTz.set({
        hour: endHour,
        minute: endMinute,
        second: 0,
        millisecond: 0,
      });

      return {
        start: start.toJSDate(),
        end: end.toJSDate(),
      } as Interval;
    })
    .filter((interval) => interval.end > interval.start)
    .map((interval) => {
      const clippedStart = interval.start < dayStart ? dayStart : interval.start;
      const clippedEnd = interval.end > dayEnd ? dayEnd : interval.end;
      return { start: clippedStart, end: clippedEnd } as Interval;
    })
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function appointmentsToBusyIntervals(
  appointments: AppointmentWindow[],
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number
): Interval[] {
  return appointments
    .map((appointment) => {
      const start = DateTime.fromJSDate(appointment.startAt)
        .minus({ minutes: bufferBeforeMinutes })
        .toJSDate();
      const end = DateTime.fromJSDate(appointment.endAt)
        .plus({ minutes: bufferAfterMinutes })
        .toJSDate();
      return { start, end } as Interval;
    })
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
