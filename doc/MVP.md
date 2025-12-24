## 4. MVP vs Pro Feature Split

Rooted in what Acuity exposes: scheduling core, payments, CRM, reporting, customization, etc.

### 4.1 MVP Scope (V1)

**Goal:** Ship a reliable, focused scheduling tool with rock-solid booking logic.

**Included:**

* **Core scheduling**

  * 1:1 appointments
  * Single business timezone
  * Staff-level weekly availability
  * Availability exceptions / blackouts
  * Double-booking protection
  * Per-service duration & buffer
  * Lead/future booking limits
* **Basic CRM**

  * Client records (name, email, phone)
  * Appointment history (per client)
* **Simple booking UI**

  * Public booking page
  * Service → date → time → client details → confirm
* **Basic notifications**

  * Email confirmation
  * Email reminders
* **Basic payments**

  * One-time payments (Stripe)
  * Full amount only (no deposits)
* **Admin calendar**

  * Day/week/month views
  * Per-staff filtering
* **Branding**

  * Logo + primary color
* **Basic reporting**

  * Appointment count by day
  * Revenue by day (from payments table)

### 4.2 Pro / Advanced Scope

**Goal:** Match Acuity-class feature depth and monetization potential.

**Pro Features:**

* **Advanced scheduling**

  * Group/class bookings (capacity)
  * Multi-resource booking (rooms/equipment)
  * Multi-timezone client display (timezone-aware UI)
  * Advanced rules (max per day per staff, lead-times per service)
* **Advanced payments**

  * Deposits and partial payments
  * Packages (X sessions for $Y)
  * Subscriptions (recurring services)
  * No-show protection workflows
  * Gift certificates / balances
* **Automations & integrations**

  * 2-way calendar sync (Google/Outlook/iCloud)
  * Webhooks + public API
  * Zapier/Make connectors
* **Enhanced CRM**

  * Tags
  * Notes & internal flags
  * Client lifetime value & stats
* **Custom forms & intake**

  * Service-specific intake forms
  * Conditional fields
  * Intake data linked to appointments and client record
* **Advanced notifications**

  * SMS reminders & confirmations
  * Post-appointment follow-ups
  * Custom per-service templates
* **Advanced reporting**

  * Revenue per service / staff
  * Utilization / occupancy rates
  * No-show rate
  * Package & subscription analytics
* **White-label / embedding**

  * Deep theming
  * Embeddable widget
  * Custom domain (CNAME)

---

If you’d like, the next step can be:

* Turning this into **actual SQL migration files + Prisma schema**
* Or implementing the **availability engine helpers** (`subtractIntervals`, `rulesToIntervals`) in real TypeScript/Python.

**Confidence level:** **0.9**
