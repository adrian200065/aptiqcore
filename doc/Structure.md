## 1. Availability Engine Algorithm

**Goal:** Given a service, staff (optional), and date range, return bookable time slots that respect:

* Business hours & staff availability
* Service duration & buffer times
* Group/class capacity
* Existing appointments (internal)
* External calendar conflicts
* Daily appointment limits & lead/future booking windows

### 1.1 Core Inputs / Outputs

**Input:**

```ts
type GetAvailabilityInput = {
  businessId: string;
  serviceId: string;
  staffId?: string;        // optional when service can be with any staff
  date: string;            // ISO date, local to business (e.g. "2025-12-26")
  timezone: string;        // e.g. "America/Chicago"
};
```

**Output:**

```ts
type TimeSlot = {
  start: string;          // ISO datetime
  end: string;            // ISO datetime
  capacity: number;       // remaining spots (for group/class)
};

type GetAvailabilityResult = {
  date: string;
  slots: TimeSlot[];
};
```

### 1.2 High-Level Algorithm

1. **Normalize context**

   * Resolve business timezone.
   * Convert date → `[dayStart, dayEnd]` in that timezone.

2. **Fetch configuration**

   * Service (duration, buffer, capacity, max per day, lead/future limits).
   * Staff availability rules for that day.
   * Staff/resource assignments for service.
   * Business-level blackout dates / overrides.

3. **Build base working intervals**

   * From staff availability rules + business hours.
   * Result: `[ [09:00–12:00], [13:00–17:00], ... ]`.

4. **Subtract blocking events**

   * Internal appointments (with buffer time around each).
   * External calendar busy blocks.
   * Breaks, exceptions, blackout dates.

5. **Slice into candidate slots**

   * Within each free interval, step by `slotStep` (e.g. 5/10/15 minutes).
   * For each candidate start:

     * `end = start + serviceDuration`.
     * Ensure `end <= intervalEnd`.

6. **Apply constraints**

   * Lead time: `start >= now + minLeadTime`.
   * Future limit: `start <= now + maxBookAhead`.
   * Daily limit: total appointments for staff/service that day < maxDaily.
   * Capacity (group/class):

     * Compute existing bookings for that time window.
     * `remainingCapacity = maxCapacity - currentBookings`.
     * If `remainingCapacity <= 0`, skip.

7. **Return unique, sorted slots**

   * Deduplicate if multiple staff can fulfill the same slot (if you surface generic slots instead of staff-specific).
   * Include capacity per slot.

### 1.3 Pseudocode

```ts
// Availability engine core algorithm (TypeScript-style pseudocode)

interface Interval {
  start: Date;
  end: Date;
}

function getAvailability(input: GetAvailabilityInput): GetAvailabilityResult {
  const { businessId, serviceId, staffId, date, timezone } = input;

  // 1. normalize date range
  const dayStart = zonedStartOfDay(date, timezone);
  const dayEnd   = zonedEndOfDay(date, timezone);

  // 2. load config
  const business = getBusiness(businessId);
  const service  = getService(serviceId);
  const staffIds = staffId ? [staffId] : getAssignableStaffForService(serviceId);

  // 3. build base intervals per staff
  let staffIntervals: Map<string, Interval[]> = new Map();

  for (const sid of staffIds) {
    const availabilityRules = getAvailabilityRulesForStaffOnDate(sid, date);
    const baseIntervals = rulesToIntervals(availabilityRules, dayStart, dayEnd, timezone);
    const exceptions = getExceptionsForStaffOnDate(sid, date);
    const intervalsMinusExceptions = subtractIntervals(baseIntervals, exceptions);

    staffIntervals.set(sid, intervalsMinusExceptions);
  }

  // 4. subtract internal appointments & external busy blocks
  for (const sid of staffIds) {
    const appts = getAppointmentsForStaffOnDate(sid, date);
    const busyFromAppts = appointmentsToBusyIntervals(appts, service.bufferBefore, service.bufferAfter);

    const externalBusy = getExternalBusyIntervals(sid, dayStart, dayEnd);

    let freeIntervals = staffIntervals.get(sid)!;
    freeIntervals = subtractIntervals(freeIntervals, busyFromAppts);
    freeIntervals = subtractIntervals(freeIntervals, externalBusy);

    staffIntervals.set(sid, freeIntervals);
  }

  // 5. generate candidate slots
  const slotStepMinutes = service.slotStepMinutes || 15;
  const resultSlots: TimeSlot[] = [];

  for (const sid of staffIds) {
    const freeIntervals = staffIntervals.get(sid)!;
    for (const interval of freeIntervals) {
      let cursor = new Date(interval.start);

      while (cursor.getTime() + service.durationMinutes * 60000 <= interval.end.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = addMinutes(slotStart, service.durationMinutes);

        // 6. apply constraints

        // lead time
        if (!passesLeadTime(slotStart, business.minLeadMinutes)) {
          cursor = addMinutes(cursor, slotStepMinutes);
          continue;
        }

        // future booking limit
        if (!passesFutureLimit(slotStart, business.maxFutureDays)) {
          break; // all future slots will fail too
        }

        // daily limit (per staff/service)
        if (!passesDailyLimit(sid, serviceId, date, business.maxAppointmentsPerDay)) {
          break;
        }

        // capacity check (1:1 or group)
        const currentBookings = countBookingsForWindow(serviceId, slotStart, slotEnd);
        const maxCapacity = service.capacity || 1;
        const remainingCapacity = maxCapacity - currentBookings;
        if (remainingCapacity <= 0) {
          cursor = addMinutes(cursor, slotStepMinutes);
          continue;
        }

        // if all checks pass, slot is valid
        resultSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          capacity: remainingCapacity,
        });

        cursor = addMinutes(cursor, slotStepMinutes);
      }
    }
  }

  // 7. normalize / dedupe slots (e.g. multiple staff can fulfill same time)
  const normalizedSlots = mergeEquivalentSlots(resultSlots);

  return {
    date,
    slots: normalizedSlots.sort((a, b) => a.start.localeCompare(b.start)),
  };
}
```

> The actual heavy lifting is done by helper functions like `subtractIntervals`, `rulesToIntervals`, and `appointmentsToBusyIntervals`. Keep those pure and unit-tested.

---

## 2. Database Schema (PostgreSQL)

Centered on scheduling + availability, with room to extend for payments, packages, etc.

### 2.1 Core Entities

```sql
-- Businesses (top-level tenant)
CREATE TABLE businesses (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  min_lead_minutes INT NOT NULL DEFAULT 60,
  max_future_days  INT NOT NULL DEFAULT 90,
  max_appts_per_day INT NOT NULL DEFAULT 999,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (admins / staff accounts)
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff (bookable resources that can perform services)
CREATE TABLE staff (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  color_hex       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients (end customers)
CREATE TABLE clients (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email           TEXT,
  phone           TEXT,
  first_name      TEXT,
  last_name       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Services & Assignments

```sql
-- Services / Appointment types (1:1 and Group/Class)
CREATE TABLE services (
  id                UUID PRIMARY KEY,
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL CHECK (duration_minutes > 0),
  buffer_before_min INT NOT NULL DEFAULT 0,
  buffer_after_min  INT NOT NULL DEFAULT 0,
  base_price_cents  INT NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  is_group          BOOLEAN NOT NULL DEFAULT FALSE,
  capacity          INT NOT NULL DEFAULT 1,
  slot_step_minutes INT NOT NULL DEFAULT 15,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service ↔ Staff mapping (which staff can perform which services)
CREATE TABLE service_staff (
  service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

-- Optional generic resources (rooms, equipment)
CREATE TABLE resources (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity        INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service ↔ Resource mapping
CREATE TABLE service_resources (
  service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  resource_id       UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, resource_id)
);
```

### 2.3 Availability Rules & Exceptions

```sql
-- Recurring weekly availability for staff (e.g., Mon 9–17)
CREATE TABLE availability_rules (
  id              UUID PRIMARY KEY,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday         INT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun
  start_time      TIME NOT NULL,   -- local time
  end_time        TIME NOT NULL,   -- local time
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-off overrides / blackouts for staff
CREATE TABLE availability_exceptions (
  id              UUID PRIMARY KEY,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  type            TEXT NOT NULL CHECK (type IN ('blocked', 'available')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business-wide blackout days (holidays, closures)
CREATE TABLE business_blackouts (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.4 Appointments & Payments

```sql
-- Appointments (1:1 or group/class)
CREATE TABLE appointments (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Group/class attendees (supports capacity > 1)
CREATE TABLE appointment_attendees (
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (appointment_id, client_id)
);

-- Payments (simplified)
CREATE TABLE payments (
  id              UUID PRIMARY KEY,
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  provider        TEXT NOT NULL,             -- 'stripe', 'paypal', etc.
  provider_charge_id TEXT NOT NULL,
  amount_cents    INT NOT NULL,
  currency        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('authorized', 'captured', 'refunded', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 External Calendar Integrations

```sql
-- Linked external calendars (Google, Outlook, etc.)
CREATE TABLE external_calendars (
  id              UUID PRIMARY KEY,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,                  -- 'google', 'outlook', 'icloud'
  external_id     TEXT NOT NULL,                  -- calendar id
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional local cache of busy blocks
CREATE TABLE external_busy_blocks (
  id              UUID PRIMARY KEY,
  external_calendar_id UUID NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. API Contracts

I’ll outline key endpoints and payloads in a concise, code-usable way.

### 3.1 Public Booking APIs

```ts
// GET /public/services?businessId=...
interface GetPublicServicesResponse {
  services: {
    id: string;
    name: string;
    description?: string;
    durationMinutes: number;
    isGroup: boolean;
    capacity: number;
    priceCents: number;
    currency: string;
  }[];
}

// GET /public/availability?businessId=...&serviceId=...&date=YYYY-MM-DD&staffId=optional
interface GetAvailabilityResponse {
  date: string;
  slots: {
    start: string;
    end: string;
    capacity: number; // remaining capacity
  }[];
}

// POST /public/appointments
interface CreatePublicAppointmentRequest {
  businessId: string;
  serviceId: string;
  staffId?: string; // optional if auto-assign
  slotStart: string; // ISO datetime
  client: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  intakeAnswers?: Record<string, any>;
  paymentIntentId?: string; // from Stripe, if using client-side payment
}

interface CreatePublicAppointmentResponse {
  appointmentId: string;
  status: 'pending' | 'confirmed';
  startAt: string;
  endAt: string;
  manageUrl: string;
}
```

### 3.2 Admin APIs (Config & Calendar)

```ts
// GET /admin/calendar?from=...&to=...&staffId=optional
interface GetAdminCalendarResponse {
  appointments: {
    id: string;
    serviceId: string;
    staffId: string;
    clientId?: string;
    startAt: string;
    endAt: string;
    status: string;
    clientName?: string;
    serviceName: string;
  }[];
}

// POST /admin/services
interface CreateServiceRequest {
  name: string;
  description?: string;
  durationMinutes: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  basePriceCents: number;
  currency: string;
  isGroup?: boolean;
  capacity?: number;
  slotStepMinutes?: number;
  staffIds?: string[];
  resourceIds?: string[];
}

interface CreateServiceResponse {
  id: string;
}

// POST /admin/availability-rules
interface CreateAvailabilityRuleRequest {
  staffId: string;
  weekday: number; // 0-6
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
}

// POST /admin/availability-exceptions
interface CreateAvailabilityExceptionRequest {
  staffId: string;
  startAt: string;
  endAt: string;
  type: 'blocked' | 'available';
  reason?: string;
}
```

### 3.3 Payment / No-Show Protection

```ts
// POST /public/payment-intents (Stripe-style)
interface CreatePaymentIntentRequest {
  businessId: string;
  serviceId: string;
  clientEmail: string;
  amountCents: number; // deposit or full amount
  currency: string;
}

interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

// POST /admin/appointments/{id}/no-show
interface MarkNoShowResponse {
  appointmentId: string;
  status: 'no_show';
}
```
