import { DateTime } from "luxon";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import {
  appointmentsToBusyIntervals,
  rulesToIntervals,
} from "../lib/availability.js";
import { subtractIntervals } from "../lib/intervals.js";

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "completed"] as const;

type AvailabilitySlot = {
  start: string;
  end: string;
  capacity: number;
};

type AvailabilityRequest = {
  businessId: string;
  serviceId: string;
  date: string;
  staffId?: string;
  timezone?: string;
};

function isOverlapping(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}

async function getAvailabilitySlots(
  request: AvailabilityRequest
): Promise<AvailabilitySlot[]> {
  const { businessId, serviceId, date, staffId } = request;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });
  if (!business) {
    return [];
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });
  if (!service || service.businessId !== businessId) {
    return [];
  }

  const timezone = request.timezone ?? business.timezone;
  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const dayEnd = dayStart.endOf("day");

  const staffIds = staffId
    ? [staffId]
    : (
        await prisma.serviceStaff.findMany({
          where: { serviceId },
          select: { staffId: true },
        })
      ).map((row) => row.staffId);

  if (staffIds.length === 0) {
    return [];
  }

  const blackouts = await prisma.businessBlackout.findMany({
    where: {
      businessId,
      startAt: { lt: dayEnd.toJSDate() },
      endAt: { gt: dayStart.toJSDate() },
    },
  });
  const blackoutIntervals = blackouts.map((blackout) => ({
    start: blackout.startAt,
    end: blackout.endAt,
  }));

  const slotsByKey = new Map<string, AvailabilitySlot>();

  for (const staff of staffIds) {
    const dayAppointmentsCount = await prisma.appointment.count({
      where: {
        staffId: staff,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startAt: { gte: dayStart.toJSDate() },
        endAt: { lte: dayEnd.toJSDate() },
      },
    });

    if (dayAppointmentsCount >= business.maxApptsPerDay) {
      continue;
    }

    const rules = await prisma.availabilityRule.findMany({
      where: { staffId: staff, isActive: true },
    });

    let freeIntervals = rulesToIntervals(
      rules.map((rule) => ({
        weekday: rule.weekday,
        startTime: DateTime.fromJSDate(rule.startTime, { zone: "utc" }).toFormat(
          "HH:mm"
        ),
        endTime: DateTime.fromJSDate(rule.endTime, { zone: "utc" }).toFormat(
          "HH:mm"
        ),
        isActive: rule.isActive,
      })),
      dayStart.toJSDate(),
      dayEnd.toJSDate(),
      timezone
    );

    const exceptions = await prisma.availabilityException.findMany({
      where: {
        staffId: staff,
        type: "blocked",
        startAt: { lt: dayEnd.toJSDate() },
        endAt: { gt: dayStart.toJSDate() },
      },
    });

    const exceptionIntervals = exceptions.map((exception) => ({
      start: exception.startAt,
      end: exception.endAt,
    }));

    const appointments = await prisma.appointment.findMany({
      where: {
        staffId: staff,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startAt: { lt: dayEnd.toJSDate() },
        endAt: { gt: dayStart.toJSDate() },
      },
      include: { _count: { select: { attendees: true } } },
    });

    const busyFromAppointments = appointmentsToBusyIntervals(
      appointments.map((appointment) => ({
        startAt: appointment.startAt,
        endAt: appointment.endAt,
      })),
      service.bufferBeforeMin,
      service.bufferAfterMin
    );

    freeIntervals = subtractIntervals(
      freeIntervals,
      busyFromAppointments.concat(exceptionIntervals, blackoutIntervals)
    );

    const slotStepMinutes = service.slotStepMinutes;
    const durationMinutes = service.durationMinutes;
    const leadTime = business.minLeadMinutes;
    const maxFutureDays = business.maxFutureDays;

    for (const interval of freeIntervals) {
      let cursor = DateTime.fromJSDate(interval.start).setZone(timezone);
      const intervalEnd = DateTime.fromJSDate(interval.end).setZone(timezone);

      while (cursor.plus({ minutes: durationMinutes }) <= intervalEnd) {
        const slotStart = cursor;
        const slotEnd = cursor.plus({ minutes: durationMinutes });
        const now = DateTime.now().setZone(timezone);

        if (slotStart < now.plus({ minutes: leadTime })) {
          cursor = cursor.plus({ minutes: slotStepMinutes });
          continue;
        }

        if (slotStart > now.plus({ days: maxFutureDays })) {
          break;
        }

        const overlappingAppointments = appointments.filter((appointment) =>
          isOverlapping(
            appointment.startAt,
            appointment.endAt,
            slotStart.toJSDate(),
            slotEnd.toJSDate()
          )
        );

        let remainingCapacity = 0;
        if (service.isGroup) {
          const usedCapacity = overlappingAppointments.reduce((sum, appt) => {
            const attendees = appt._count.attendees ?? 0;
            return sum + Math.max(1, attendees);
          }, 0);
          remainingCapacity = Math.max(0, service.capacity - usedCapacity);
        } else {
          remainingCapacity = Math.max(0, service.capacity - overlappingAppointments.length);
        }

        if (remainingCapacity > 0) {
          const key = `${slotStart.toISO()}|${slotEnd.toISO()}`;
          const existing = slotsByKey.get(key);
          if (existing) {
            existing.capacity = Math.max(existing.capacity, remainingCapacity);
          } else {
            slotsByKey.set(key, {
              start: slotStart.toISO(),
              end: slotEnd.toISO(),
              capacity: remainingCapacity,
            });
          }
        }

        cursor = cursor.plus({ minutes: slotStepMinutes });
      }
    }
  }

  return [...slotsByKey.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/public/services", async (request, reply) => {
    const query = request.query as { businessId?: string };
    if (!query.businessId) {
      reply.code(400).send({ error: "businessId is required" });
      return;
    }

    const services = await prisma.service.findMany({
      where: { businessId: query.businessId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        isGroup: true,
        capacity: true,
        basePriceCents: true,
        currency: true,
      },
    });

    reply.send({ services });
  });

  app.get("/public/staff", async (request, reply) => {
    const query = request.query as { businessId?: string };
    if (!query.businessId) {
      reply.code(400).send({ error: "businessId is required" });
      return;
    }

    const staff = await prisma.staff.findMany({
      where: { businessId: query.businessId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    reply.send({ staff });
  });

  app.get("/public/availability", async (request, reply) => {
    const query = request.query as {
      businessId?: string;
      serviceId?: string;
      date?: string;
      staffId?: string;
      timezone?: string;
    };

    if (!query.businessId || !query.serviceId || !query.date) {
      reply.code(400).send({ error: "businessId, serviceId, and date required" });
      return;
    }

    const slots = await getAvailabilitySlots({
      businessId: query.businessId,
      serviceId: query.serviceId,
      date: query.date,
      staffId: query.staffId,
      timezone: query.timezone,
    });

    reply.send({ date: query.date, slots });
  });

  app.post("/public/appointments", async (request, reply) => {
    const body = request.body as {
      businessId?: string;
      serviceId?: string;
      staffId?: string;
      slotStart?: string;
      client?: {
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
      };
    };

    if (!body.businessId || !body.serviceId || !body.slotStart) {
      reply
        .code(400)
        .send({ error: "businessId, serviceId, slotStart required" });
      return;
    }

    const business = await prisma.business.findUnique({
      where: { id: body.businessId },
    });
    if (!business) {
      reply.code(404).send({ error: "business not found" });
      return;
    }

    const service = await prisma.service.findUnique({
      where: { id: body.serviceId },
    });
    if (!service || service.businessId !== body.businessId) {
      reply.code(404).send({ error: "service not found" });
      return;
    }

    if (service.isGroup && !body.client) {
      reply.code(400).send({ error: "client details required for group booking" });
      return;
    }

    const slotStart = DateTime.fromISO(body.slotStart);
    if (!slotStart.isValid) {
      reply.code(400).send({ error: "slotStart must be ISO datetime" });
      return;
    }

    const slotEnd = slotStart.plus({ minutes: service.durationMinutes });

    const timezone = business.timezone;
    const now = DateTime.now().setZone(timezone);
    const slotStartTz = slotStart.setZone(timezone);
    const minLead = now.plus({ minutes: business.minLeadMinutes });
    const maxFuture = now.plus({ days: business.maxFutureDays });

    if (slotStartTz < minLead) {
      reply.code(400).send({ error: "slotStart violates lead time" });
      return;
    }

    if (slotStartTz > maxFuture) {
      reply.code(400).send({ error: "slotStart too far in future" });
      return;
    }

    const staffIds = body.staffId
      ? [body.staffId]
      : (
          await prisma.serviceStaff.findMany({
            where: { serviceId: body.serviceId },
            select: { staffId: true },
          })
        ).map((row) => row.staffId);

    if (staffIds.length === 0) {
      reply.code(400).send({ error: "no staff available for service" });
      return;
    }

    const dayStart = slotStartTz.startOf("day").toJSDate();
    const dayEnd = slotStartTz.endOf("day").toJSDate();

    let clientId: string | undefined = undefined;
    if (body.client?.email || body.client?.phone) {
      const existing = await prisma.client.findFirst({
        where: {
          businessId: body.businessId,
          OR: [
            body.client?.email ? { email: body.client.email } : undefined,
            body.client?.phone ? { phone: body.client.phone } : undefined,
          ].filter(Boolean) as any,
        },
      });

      if (existing) {
        clientId = existing.id;
      } else {
        const created = await prisma.client.create({
          data: {
            businessId: body.businessId,
            email: body.client?.email,
            phone: body.client?.phone,
            firstName: body.client?.firstName,
            lastName: body.client?.lastName,
          },
        });
        clientId = created.id;
      }
    }

    for (const staffId of staffIds) {
      const availability = await getAvailabilitySlots({
        businessId: body.businessId,
        serviceId: body.serviceId,
        date: slotStartTz.toISODate(),
        staffId,
        timezone,
      });

      const slotMillis = slotStart.toMillis();
      const matching = availability.find(
        (slot) => DateTime.fromISO(slot.start).toMillis() === slotMillis
      );
      if (!matching || matching.capacity <= 0) {
        continue;
      }

      const dailyCount = await prisma.appointment.count({
        where: {
          staffId,
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          startAt: { gte: dayStart },
          endAt: { lte: dayEnd },
        },
      });

      if (dailyCount >= business.maxApptsPerDay) {
        continue;
      }

      let appointment = await prisma.appointment.findFirst({
        where: {
          staffId,
          serviceId: body.serviceId,
          startAt: slotStart.toJSDate(),
          endAt: slotEnd.toJSDate(),
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        },
        include: { _count: { select: { attendees: true } } },
      });

      if (service.isGroup && appointment) {
        const usedCapacity = Math.max(1, appointment._count.attendees ?? 0);
        if (usedCapacity >= service.capacity) {
          continue;
        }
      }

      if (!appointment) {
        appointment = await prisma.appointment.create({
          data: {
            businessId: body.businessId,
            serviceId: body.serviceId,
            staffId,
            clientId: service.isGroup ? undefined : clientId,
            startAt: slotStart.toJSDate(),
            endAt: slotEnd.toJSDate(),
            status: "confirmed",
          },
        });
      }

      if (service.isGroup && clientId) {
        await prisma.appointmentAttendee.create({
          data: {
            appointmentId: appointment.id,
            clientId,
          },
        });
      }

      reply.send({
        appointmentId: appointment.id,
        status: appointment.status,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        manageUrl: "",
        staffId,
      });
      return;
    }

    reply.code(409).send({ error: "slot no longer available" });
  });
}
