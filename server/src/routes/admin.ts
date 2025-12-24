import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

function getTokenTtlMs() {
  const value = Number(process.env.ADMIN_TOKEN_TTL_MINUTES ?? 60);
  if (!Number.isFinite(value) || value <= 0) {
    return 60 * 60 * 1000;
  }
  return value * 60 * 1000;
}

function parseBearerToken(header?: string) {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

async function issueSession(adminUserId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + getTokenTtlMs());
  await prisma.adminSession.create({
    data: {
      adminUserId,
      token,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/admin/login")) {
      return;
    }

    const token = parseBearerToken(request.headers.authorization);
    if (!token) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    await prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { adminUser: true },
    });

    if (!session || session.expiresAt < new Date()) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    (request as { adminUser?: { id: string; username: string } }).adminUser = {
      id: session.adminUser.id,
      username: session.adminUser.username,
    };
  });

  app.post("/admin/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      reply.code(400).send({ error: "username and password required" });
      return;
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username: body.username },
    });
    if (!admin) {
      reply.code(401).send({ error: "invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(body.password, admin.passwordHash);
    if (!isValid) {
      reply.code(401).send({ error: "invalid credentials" });
      return;
    }

    const { token, expiresAt } = await issueSession(admin.id);
    reply.send({
      token,
      expiresInMinutes: Math.round((expiresAt.getTime() - Date.now()) / 60000),
    });
  });

  app.post("/admin/logout", async (request, reply) => {
    const token = parseBearerToken(request.headers.authorization);
    if (token) {
      await prisma.adminSession.delete({ where: { token } }).catch(() => null);
    }
    reply.send({ ok: true });
  });

  app.get("/admin/me", async (request, reply) => {
    const admin = (request as { adminUser?: { id: string; username: string } }).adminUser;
    if (!admin) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    reply.send({ id: admin.id, username: admin.username });
  });

  app.get("/admin/staff", async (request, reply) => {
    const query = request.query as { businessId?: string };
    if (!query.businessId) {
      reply.code(400).send({ error: "businessId required" });
      return;
    }

    const staff = await prisma.staff.findMany({
      where: { businessId: query.businessId },
      orderBy: { name: "asc" },
    });

    reply.send({
      staff: staff.map((member) => ({
        id: member.id,
        name: member.name,
        isActive: member.isActive,
      })),
    });
  });

  app.get("/admin/services", async (request, reply) => {
    const query = request.query as { businessId?: string };
    if (!query.businessId) {
      reply.code(400).send({ error: "businessId required" });
      return;
    }

    const services = await prisma.service.findMany({
      where: { businessId: query.businessId },
      include: { staffAssignments: true },
      orderBy: { name: "asc" },
    });

    reply.send({
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        isGroup: service.isGroup,
        capacity: service.capacity,
        staffIds: service.staffAssignments.map((assignment) => assignment.staffId),
      })),
    });
  });

  app.get("/admin/calendar", async (request, reply) => {
    const query = request.query as {
      businessId?: string;
      from?: string;
      to?: string;
      staffId?: string;
    };

    if (!query.businessId || !query.from || !query.to) {
      reply.code(400).send({ error: "businessId, from, to required" });
      return;
    }

    if (Number.isNaN(Date.parse(query.from)) || Number.isNaN(Date.parse(query.to))) {
      reply.code(400).send({ error: "from/to must be ISO datetimes" });
      return;
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: query.businessId,
        staffId: query.staffId,
        startAt: { gte: new Date(query.from) },
        endAt: { lte: new Date(query.to) },
      },
      include: {
        service: { select: { name: true } },
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startAt: "asc" },
    });

    reply.send({
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        serviceId: appointment.serviceId,
        staffId: appointment.staffId,
        clientId: appointment.clientId ?? undefined,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        status: appointment.status,
        clientName: appointment.client
          ? `${appointment.client.firstName ?? ""} ${
              appointment.client.lastName ?? ""
            }`.trim()
          : undefined,
        serviceName: appointment.service.name,
      })),
    });
  });

  app.post("/admin/services", async (request, reply) => {
    const body = request.body as {
      businessId?: string;
      name?: string;
      description?: string;
      durationMinutes?: number;
      bufferBeforeMin?: number;
      bufferAfterMin?: number;
      basePriceCents?: number;
      currency?: string;
      isGroup?: boolean;
      capacity?: number;
      slotStepMinutes?: number;
      staffIds?: string[];
      resourceIds?: string[];
    };

    if (!body.businessId || !body.name || !body.durationMinutes) {
      reply.code(400).send({ error: "businessId, name, durationMinutes required" });
      return;
    }

    const created = await prisma.service.create({
      data: {
        businessId: body.businessId,
        name: body.name,
        description: body.description,
        durationMinutes: body.durationMinutes,
        bufferBeforeMin: body.bufferBeforeMin ?? 0,
        bufferAfterMin: body.bufferAfterMin ?? 0,
        basePriceCents: body.basePriceCents ?? 0,
        currency: body.currency ?? "USD",
        isGroup: body.isGroup ?? false,
        capacity: body.capacity ?? 1,
        slotStepMinutes: body.slotStepMinutes ?? 15,
      },
    });

    if (body.staffIds?.length) {
      await prisma.serviceStaff.createMany({
        data: body.staffIds.map((staffId) => ({
          staffId,
          serviceId: created.id,
        })),
        skipDuplicates: true,
      });
    }

    if (body.resourceIds?.length) {
      await prisma.serviceResource.createMany({
        data: body.resourceIds.map((resourceId) => ({
          resourceId,
          serviceId: created.id,
        })),
        skipDuplicates: true,
      });
    }

    reply.send({ id: created.id });
  });

  app.post("/admin/availability-rules", async (request, reply) => {
    const body = request.body as {
      staffId?: string;
      weekday?: number;
      startTime?: string;
      endTime?: string;
    };

    if (
      !body.staffId ||
      body.weekday === undefined ||
      !body.startTime ||
      !body.endTime
    ) {
      reply
        .code(400)
        .send({ error: "staffId, weekday, startTime, endTime required" });
      return;
    }

    const rule = await prisma.availabilityRule.create({
      data: {
        staffId: body.staffId,
        weekday: body.weekday,
        startTime: new Date(`1970-01-01T${body.startTime}:00.000Z`),
        endTime: new Date(`1970-01-01T${body.endTime}:00.000Z`),
      },
    });

    reply.send({ id: rule.id });
  });

  app.post("/admin/availability-exceptions", async (request, reply) => {
    const body = request.body as {
      staffId?: string;
      startAt?: string;
      endAt?: string;
      type?: "blocked" | "available";
      reason?: string;
    };

    if (!body.staffId || !body.startAt || !body.endAt || !body.type) {
      reply
        .code(400)
        .send({ error: "staffId, startAt, endAt, type required" });
      return;
    }

    const exception = await prisma.availabilityException.create({
      data: {
        staffId: body.staffId,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        type: body.type,
        reason: body.reason,
      },
    });

    reply.send({ id: exception.id });
  });
}
