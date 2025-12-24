import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function resetAll() {
  await prisma.appointmentAttendee.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.externalBusyBlock.deleteMany();
  await prisma.externalCalendar.deleteMany();
  await prisma.availabilityException.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.serviceResource.deleteMany();
  await prisma.serviceStaff.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.client.deleteMany();
  await prisma.businessBlackout.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();
}

async function main() {
  if (process.env.SEED_RESET === "true") {
    await resetAll();
  }

  const adminUser = process.env.ADMIN_SEED_USER;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (adminUser && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.adminUser.upsert({
      where: { username: adminUser },
      update: { passwordHash },
      create: { username: adminUser, passwordHash },
    });
  }

  const business = await prisma.business.create({
    data: {
      name: "Aptiq Demo",
      timezone: "America/Chicago",
      minLeadMinutes: 60,
      maxFutureDays: 90,
      maxApptsPerDay: 12,
    },
  });

  const staff = await prisma.staff.createMany({
    data: [
      { businessId: business.id, name: "Jordan Lee", colorHex: "#2563eb" },
      { businessId: business.id, name: "Casey Morgan", colorHex: "#16a34a" },
    ],
  });

  const staffRows = await prisma.staff.findMany({
    where: { businessId: business.id },
  });

  const consultation = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "Consultation",
      description: "60-minute 1:1 session",
      durationMinutes: 60,
      bufferBeforeMin: 10,
      bufferAfterMin: 10,
      basePriceCents: 7500,
      currency: "USD",
      isGroup: false,
      capacity: 1,
      slotStepMinutes: 15,
    },
  });

  const group = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "Group Session",
      description: "90-minute small-group session",
      durationMinutes: 90,
      bufferBeforeMin: 10,
      bufferAfterMin: 10,
      basePriceCents: 4500,
      currency: "USD",
      isGroup: true,
      capacity: 6,
      slotStepMinutes: 15,
    },
  });

  await prisma.serviceStaff.createMany({
    data: staffRows.flatMap((staffRow) => [
      { staffId: staffRow.id, serviceId: consultation.id },
      { staffId: staffRow.id, serviceId: group.id },
    ]),
  });

  const ruleData = staffRows.flatMap((staffRow) => [
    {
      staffId: staffRow.id,
      weekday: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 1,
      startTime: new Date("1970-01-01T13:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 2,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 2,
      startTime: new Date("1970-01-01T13:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 3,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 3,
      startTime: new Date("1970-01-01T13:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 4,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 4,
      startTime: new Date("1970-01-01T13:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 5,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    },
    {
      staffId: staffRow.id,
      weekday: 5,
      startTime: new Date("1970-01-01T13:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
  ]);

  await prisma.availabilityRule.createMany({ data: ruleData });

  console.log("Seed complete");
  console.log("Business ID:", business.id);
  console.log("Consultation service ID:", consultation.id);
  console.log("Group session service ID:", group.id);
  console.log("Staff IDs:", staffRows.map((row) => row.id).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
