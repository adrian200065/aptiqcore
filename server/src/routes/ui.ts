import type { FastifyInstance } from "fastify";

const bookingHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aptiq Booking</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f4ef;
        --panel: #ffffff;
        --ink: #1f2937;
        --muted: #6b7280;
        --accent: #0f766e;
        --accent-2: #ef4444;
        --shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Montserrat", "Trebuchet MS", sans-serif;
        background: radial-gradient(circle at top left, #fef3c7, #f7f4ef 45%, #e0f2fe 100%);
        color: var(--ink);
      }
      header {
        padding: 32px 24px 0;
      }
      header h1 {
        margin: 0 0 8px;
        font-size: 32px;
        letter-spacing: -0.02em;
      }
      header p {
        margin: 0;
        color: var(--muted);
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 24px;
        padding: 24px;
      }
      .panel {
        background: var(--panel);
        border-radius: 16px;
        padding: 20px;
        box-shadow: var(--shadow);
      }
      label {
        display: block;
        font-weight: 600;
        margin-bottom: 6px;
      }
      input,
      select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
        font-size: 14px;
      }
      button {
        padding: 10px 16px;
        border-radius: 999px;
        border: none;
        background: var(--accent);
        color: white;
        font-weight: 600;
        cursor: pointer;
      }
      button.secondary {
        background: #0f172a;
      }
      button.danger {
        background: var(--accent-2);
      }
      .field {
        margin-bottom: 16px;
      }
      .slots {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .slots button {
        background: #f1f5f9;
        color: var(--ink);
        border: 1px solid #e2e8f0;
      }
      .slots button.active {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }
      .status {
        margin-top: 12px;
        font-size: 14px;
        color: var(--muted);
      }
      .status.error {
        color: var(--accent-2);
      }
      .list {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      .list-item {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        background: #f8fafc;
        font-size: 14px;
      }
      .list-item strong {
        display: block;
        font-weight: 600;
      }
      .split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 720px) {
        header {
          padding: 24px 16px 0;
        }
        main {
          padding: 16px;
        }
        .split {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Book an Appointment</h1>
      <p>Pick a service, staff member, and slot to confirm your booking.</p>
    </header>
    <main>
      <section class="panel">
        <div class="field">
          <label for="businessId">Business ID</label>
          <input id="businessId" placeholder="Paste business id" />
        </div>
        <div class="field">
          <label for="service">Service</label>
          <select id="service"></select>
        </div>
        <div class="field">
          <label for="staff">Staff</label>
          <select id="staff"></select>
        </div>
        <div class="field">
          <label for="date">Date</label>
          <input id="date" type="date" />
        </div>
        <button id="load">Load availability</button>
        <p class="status" id="availabilityStatus">Pick a date to load slots.</p>
      </section>
      <section class="panel">
        <h3>Available slots</h3>
        <div class="slots" id="slots"></div>
        <p class="status" id="slotStatus">Select a slot to continue.</p>
      </section>
      <section class="panel">
        <h3>Your details</h3>
        <div class="field split">
          <div>
            <label for="firstName">First name</label>
            <input id="firstName" />
          </div>
          <div>
            <label for="lastName">Last name</label>
            <input id="lastName" />
          </div>
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" />
        </div>
        <div class="field">
          <label for="phone">Phone</label>
          <input id="phone" />
        </div>
        <button id="book" class="secondary">Confirm booking</button>
        <p class="status" id="bookingStatus"></p>
      </section>
    </main>
    <script>
      const state = {
        selectedSlot: null,
      };

      const businessInput = document.getElementById("businessId");
      const serviceSelect = document.getElementById("service");
      const staffSelect = document.getElementById("staff");
      const dateInput = document.getElementById("date");
      const slotsEl = document.getElementById("slots");
      const slotStatus = document.getElementById("slotStatus");
      const availabilityStatus = document.getElementById("availabilityStatus");
      const bookingStatus = document.getElementById("bookingStatus");

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      function setStatus(el, message, isError = false) {
        el.textContent = message;
        el.className = "status" + (isError ? " error" : "");
      }

      function getBusinessId() {
        return businessInput.value.trim();
      }

      async function loadServices() {
        const businessId = getBusinessId();
        if (!businessId) {
          setStatus(availabilityStatus, "Enter a business id.", true);
          return;
        }
        const [servicesRes, staffRes] = await Promise.all([
          fetch("/public/services?businessId=" + encodeURIComponent(businessId)),
          fetch("/public/staff?businessId=" + encodeURIComponent(businessId)),
        ]);
        if (!servicesRes.ok || !staffRes.ok) {
          setStatus(availabilityStatus, "Unable to load services or staff.", true);
          return;
        }
        const services = await servicesRes.json();
        const staff = await staffRes.json();

        serviceSelect.innerHTML = "";
        (services.services || []).forEach((service) => {
          const option = document.createElement("option");
          option.value = service.id;
          option.textContent =
            service.name + " (" + service.durationMinutes + "m)";
          serviceSelect.appendChild(option);
        });

        staffSelect.innerHTML = "";
        (staff.staff || []).forEach((person) => {
          const option = document.createElement("option");
          option.value = person.id;
          option.textContent = person.name;
          staffSelect.appendChild(option);
        });
      }

      async function loadAvailability() {
        const businessId = getBusinessId();
        const serviceId = serviceSelect.value;
        const staffId = staffSelect.value;
        const date = dateInput.value;

        if (!businessId || !serviceId || !staffId || !date) {
          setStatus(availabilityStatus, "Business, service, staff, and date are required.", true);
          return;
        }

        setStatus(availabilityStatus, "Loading availability...");
        const response = await fetch(
          "/public/availability?businessId=" +
            encodeURIComponent(businessId) +
            "&serviceId=" +
            encodeURIComponent(serviceId) +
            "&staffId=" +
            encodeURIComponent(staffId) +
            "&date=" +
            encodeURIComponent(date) +
            "&timezone=" +
            encodeURIComponent(timezone)
        );
        if (!response.ok) {
          setStatus(availabilityStatus, "Unable to load availability.", true);
          return;
        }
        const data = await response.json();
        slotsEl.innerHTML = "";
        state.selectedSlot = null;

        if (!data.slots || data.slots.length === 0) {
          setStatus(availabilityStatus, "No slots available.");
          return;
        }

        data.slots.forEach((slot) => {
          const button = document.createElement("button");
          const start = new Date(slot.start);
          button.textContent = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          button.addEventListener("click", () => {
            document.querySelectorAll(".slots button").forEach((el) => el.classList.remove("active"));
            button.classList.add("active");
            state.selectedSlot = slot.start;
            setStatus(
              slotStatus,
              "Selected " + start.toLocaleString() + ". Capacity " + slot.capacity + "."
            );
          });
          slotsEl.appendChild(button);
        });

        setStatus(availabilityStatus, "Select a slot.");
      }

      async function bookSlot() {
        const businessId = getBusinessId();
        const serviceId = serviceSelect.value;
        const staffId = staffSelect.value;

        if (!businessId || !serviceId || !staffId) {
          setStatus(bookingStatus, "Business, service, and staff required.", true);
          return;
        }
        if (!state.selectedSlot) {
          setStatus(bookingStatus, "Select a slot first.", true);
          return;
        }

        const payload = {
          businessId,
          serviceId,
          staffId,
          slotStart: state.selectedSlot,
          client: {
            firstName: document.getElementById("firstName").value,
            lastName: document.getElementById("lastName").value,
            email: document.getElementById("email").value,
            phone: document.getElementById("phone").value,
          },
        };

        setStatus(bookingStatus, "Booking...");
        const response = await fetch("/public/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          setStatus(bookingStatus, data.error || "Booking failed", true);
          return;
        }

        const data = await response.json();
        setStatus(bookingStatus, "Booked! Appointment " + data.appointmentId);
      }

      document.getElementById("load").addEventListener("click", loadAvailability);
      document.getElementById("book").addEventListener("click", bookSlot);
      dateInput.valueAsDate = new Date();

      const params = new URLSearchParams(window.location.search);
      const queryBusinessId = params.get("businessId");
      if (queryBusinessId) {
        businessInput.value = queryBusinessId;
        loadServices();
      }

      businessInput.addEventListener("blur", loadServices);
      serviceSelect.addEventListener("change", loadAvailability);
      staffSelect.addEventListener("change", loadAvailability);
      dateInput.addEventListener("change", loadAvailability);
    </script>
  </body>
</html>
`;

const adminHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aptiq Scheduling - Calendar</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f6f4;
        --panel: #ffffff;
        --ink: #0f172a;
        --muted: #6b7280;
        --accent: #111827;
        --line: #e5e7eb;
        --note-blue: #e0eaff;
        --note-red: #fbe5e2;
        --sidebar: #f2f2ef;
        --event-green: #92d2a0;
        --event-purple: #7b48b7;
        --event-red: #c84a50;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Montserrat", "Trebuchet MS", sans-serif;
        background: var(--bg);
        color: var(--ink);
      }
      .app {
        display: grid;
        grid-template-columns: 240px 1fr;
        min-height: 100vh;
      }
      aside {
        background: var(--sidebar);
        padding: 22px 18px;
        border-right: 1px solid #e6e6e1;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .brand {
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: lowercase;
      }
      .mini-calendar {
        background: white;
        border-radius: 12px;
        padding: 14px;
        border: 1px solid var(--line);
      }
      .mini-calendar h4 {
        margin: 0 0 8px;
        font-size: 13px;
        color: var(--muted);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .mini-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        font-size: 11px;
        text-align: center;
      }
      .mini-day {
        padding: 6px 0;
        border-radius: 999px;
        color: var(--muted);
      }
      .mini-day.active {
        background: #111827;
        color: white;
        font-weight: 600;
      }
      nav h5 {
        margin: 0 0 10px;
        font-size: 11px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      nav a {
        display: block;
        padding: 6px 0;
        font-size: 13px;
        color: #1f2937;
        text-decoration: none;
      }
      nav a.active {
        font-weight: 700;
      }
      .account {
        margin-top: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--muted);
      }
      .avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #d1d5db;
        display: grid;
        place-items: center;
        font-weight: 700;
        color: #374151;
      }
      main {
        display: flex;
        flex-direction: column;
      }
      .topbar {
        padding: 18px 28px;
        border-bottom: 1px solid var(--line);
        background: white;
      }
      .topbar h1 {
        margin: 0;
        font-size: 18px;
      }
      .topbar small {
        color: var(--muted);
        font-weight: 500;
      }
      .top-actions {
        margin-top: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .action-left,
      .action-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        color: #111827;
        background: #f8fafc;
      }
      .btn {
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: white;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn.primary {
        background: #111827;
        color: white;
      }
      .alerts {
        padding: 0 28px 16px;
        display: grid;
        gap: 10px;
        background: white;
      }
      .alert {
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .alert.blue {
        background: var(--note-blue);
      }
      .alert.red {
        background: var(--note-red);
      }
      .toolbar {
        padding: 12px 28px;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: white;
        flex-wrap: wrap;
      }
      .toolbar .filters,
      .toolbar .inputs {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .toolbar input,
      .toolbar select {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
      }
      .calendar {
        flex: 1;
        background: white;
      }
      .calendar-head {
        display: grid;
        grid-template-columns: 80px repeat(7, 1fr);
        border-bottom: 1px solid var(--line);
        background: #fafafa;
        font-size: 11px;
        color: var(--muted);
      }
      .calendar-head div {
        padding: 8px 6px;
        text-align: center;
        border-right: 1px solid var(--line);
      }
      .calendar-body {
        display: grid;
        grid-template-columns: 80px repeat(7, 1fr);
      }
      .time-col {
        border-right: 1px solid var(--line);
        background: #fafafa;
        font-size: 11px;
        color: var(--muted);
      }
      .time-col div {
        height: 60px;
        padding: 6px 6px 0;
        text-align: right;
        border-bottom: 1px solid var(--line);
      }
      .day-col {
        position: relative;
        height: 540px;
        border-right: 1px solid var(--line);
        background-image: repeating-linear-gradient(
          to bottom,
          transparent,
          transparent 59px,
          var(--line) 60px
        );
      }
      .day-col.weekend {
        background-color: #f4f4f1;
      }
      .event {
        position: absolute;
        left: 8px;
        right: 8px;
        border-radius: 6px;
        padding: 6px;
        font-size: 10px;
        line-height: 1.2;
        color: #111827;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
      }
      .login-strip {
        padding: 12px 28px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        background: #fff7ed;
      }
      .login-strip input {
        border-radius: 8px;
        border: 1px solid var(--line);
        padding: 6px 10px;
        font-size: 12px;
      }
      .login-strip .status {
        font-size: 12px;
        color: var(--muted);
      }
      @media (max-width: 980px) {
        .app {
          grid-template-columns: 1fr;
        }
        aside {
          flex-direction: row;
          flex-wrap: wrap;
          border-right: none;
          border-bottom: 1px solid var(--line);
        }
        .mini-calendar, nav, .account {
          flex: 1 1 220px;
        }
      }
      @media (max-width: 720px) {
        .calendar {
          overflow-x: auto;
        }
        .calendar-head,
        .calendar-body {
          min-width: 780px;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside>
        <div class="brand">acutiq:scheduling</div>
        <div class="mini-calendar">
          <h4>
            <span id="miniMonth">December 2025</span>
            <span>◀ ▶</span>
          </h4>
          <div class="mini-grid" id="miniGrid"></div>
        </div>
        <nav>
          <h5>Overview</h5>
          <a class="active" href="#">Calendar</a>
          <a href="#">Scheduling Page</a>
          <a href="#">Clients</a>
          <a href="#">Invoices</a>
          <a href="#">Reports</a>
          <h5>Business Settings</h5>
          <a href="#">Availability</a>
          <a href="#">Appointment Types</a>
          <a href="#">Intake Form Questions</a>
          <a href="#">Packages, Gifts & Subscriptions</a>
          <a href="#">Integrations</a>
          <a href="#">Sync with other Calendars</a>
          <a href="#">Payment Settings</a>
          <h5>Notifications</h5>
          <a href="#">Client Emails</a>
          <a href="#">Client Text Messages</a>
          <a href="#">Booking Alerts</a>
          <h5>Account</h5>
          <a href="#">Manage Users</a>
          <a href="#">Manage Billing</a>
        </nav>
        <div class="account">
          <div class="avatar" id="adminAvatar">AC</div>
          <div>
            <div id="adminName">Admin</div>
            <div id="adminEmail">admin@aptiqcore.com</div>
          </div>
        </div>
      </aside>
      <main>
        <div class="login-strip" id="loginStrip">
          <strong>Admin sign-in</strong>
          <input id="loginUser" placeholder="Username" />
          <input id="loginPass" type="password" placeholder="Password" />
          <button class="btn primary" id="loginBtn">Login</button>
          <button class="btn" id="logoutBtn">Logout</button>
          <span class="status" id="loginStatus">Not signed in.</span>
        </div>
        <div class="topbar">
          <h1 id="weekTitle">Week</h1>
          <div class="top-actions">
            <div class="action-left">
              <span class="pill" id="appointmentCount">0 appointments</span>
            </div>
            <div class="action-right">
              <button class="btn">Block off time</button>
              <button class="btn primary">Add new</button>
            </div>
          </div>
        </div>
        <div class="alerts">
          <div class="alert blue">
            <span>Your Aptiq login is now powered by Squarespace. This update gives you access to more sign-in choices.</span>
            <span>Learn more</span>
          </div>
          <div class="alert red">
            <span>We are not able to sync with your iCloud Calendar. Please sign in to iCloud to fix this.</span>
            <span>Close</span>
          </div>
        </div>
        <div class="toolbar">
          <div class="filters">
            <button class="btn" id="todayBtn">Today</button>
            <span class="pill">Week View</span>
            <span class="pill">All calendars</span>
            <span class="pill">1x</span>
          </div>
          <div class="inputs">
            <input id="businessId" placeholder="Business ID" />
            <select id="staffFilter">
              <option value="">All staff</option>
            </select>
            <input id="weekPicker" type="date" />
            <input id="searchInput" placeholder="Search" />
          </div>
        </div>
        <div class="calendar">
          <div class="calendar-head" id="calendarHead"></div>
          <div class="calendar-body" id="calendarBody"></div>
        </div>
      </main>
    </div>
    <script>
      const hourStart = 9;
      const hourEnd = 18;
      const hourHeight = 60;
      const loginStatus = document.getElementById("loginStatus");
      const loginBtn = document.getElementById("loginBtn");
      const logoutBtn = document.getElementById("logoutBtn");
      const weekTitle = document.getElementById("weekTitle");
      const appointmentCount = document.getElementById("appointmentCount");
      const businessInput = document.getElementById("businessId");
      const staffFilter = document.getElementById("staffFilter");
      const weekPicker = document.getElementById("weekPicker");
      const calendarHead = document.getElementById("calendarHead");
      const calendarBody = document.getElementById("calendarBody");
      const miniGrid = document.getElementById("miniGrid");
      const miniMonth = document.getElementById("miniMonth");

      function setStatus(message, isError) {
        loginStatus.textContent = message;
        loginStatus.style.color = isError ? "#b91c1c" : "#6b7280";
      }

      function getToken() {
        return window.localStorage.getItem("aptiq_admin_token");
      }

      function setToken(token) {
        if (!token) {
          window.localStorage.removeItem("aptiq_admin_token");
          setStatus("Not signed in.", true);
          return;
        }
        window.localStorage.setItem("aptiq_admin_token", token);
        setStatus("Signed in. Token stored.", false);
      }

      async function apiFetch(path, options) {
        const token = getToken();
        if (!token) {
          throw new Error("No token stored.");
        }
        const headers = options && options.headers ? options.headers : {};
        headers.Authorization = "Bearer " + token;
        return fetch(path, Object.assign({}, options || {}, { headers: headers }));
      }

      async function login() {
        const username = document.getElementById("loginUser").value.trim();
        const password = document.getElementById("loginPass").value;
        if (!username || !password) {
          setStatus("Username and password required.", true);
          return;
        }
        setStatus("Signing in...");
        const response = await fetch("/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username, password: password }),
        });
        const data = await response.json();
        if (!response.ok) {
          setStatus(data.error || "Login failed.", true);
          return;
        }
        setToken(data.token);
        await hydrateAdmin();
        await refreshStaff();
        await refreshCalendar();
      }

      async function logout() {
        try {
          await apiFetch("/admin/logout", { method: "POST" });
        } catch (error) {
          setStatus(error.message || "Logout failed.", true);
        }
        setToken(null);
      }

      function setWeek(date) {
        const weekStart = startOfWeek(date);
        weekPicker.valueAsDate = weekStart;
        weekTitle.textContent =
          "Week of " +
          weekStart.toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
        buildMiniCalendar(weekStart);
      }

      function startOfWeek(date) {
        const start = new Date(date);
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        return start;
      }

      function buildMiniCalendar(weekStart) {
        const monthName = weekStart.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        miniMonth.textContent = monthName;
        miniGrid.innerHTML = "";
        const days = ["S", "M", "T", "W", "T", "F", "S"];
        for (let i = 0; i < days.length; i++) {
          const el = document.createElement("div");
          el.className = "mini-day";
          el.textContent = days[i];
          miniGrid.appendChild(el);
        }
        const calendarStart = new Date(weekStart);
        calendarStart.setDate(weekStart.getDate() - weekStart.getDay());
        for (let i = 0; i < 35; i++) {
          const day = new Date(calendarStart);
          day.setDate(calendarStart.getDate() + i);
          const el = document.createElement("div");
          el.className = "mini-day";
          if (day.getMonth() !== weekStart.getMonth()) {
            el.style.opacity = "0.4";
          }
          if (day.toDateString() === weekStart.toDateString()) {
            el.className = "mini-day active";
          }
          el.textContent = day.getDate();
          miniGrid.appendChild(el);
        }
      }

      function buildCalendarFrame(weekStart) {
        calendarHead.innerHTML = "";
        calendarBody.innerHTML = "";

        const headSpacer = document.createElement("div");
        calendarHead.appendChild(headSpacer);

        for (let i = 0; i < 7; i++) {
          const day = new Date(weekStart);
          day.setDate(weekStart.getDate() + i);
          const header = document.createElement("div");
          header.textContent = day.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          calendarHead.appendChild(header);
        }

        const timeCol = document.createElement("div");
        timeCol.className = "time-col";
        for (let hour = hourStart; hour < hourEnd; hour++) {
          const label = document.createElement("div");
          const display = new Date();
          display.setHours(hour, 0, 0, 0);
          label.textContent = display.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
          timeCol.appendChild(label);
        }
        calendarBody.appendChild(timeCol);

        for (let i = 0; i < 7; i++) {
          const dayCol = document.createElement("div");
          dayCol.className = "day-col" + (i === 0 || i === 6 ? " weekend" : "");
          dayCol.dataset.index = String(i);
          calendarBody.appendChild(dayCol);
        }
      }

      function getBusinessId() {
        return businessInput.value.trim();
      }

      function getWeekRange() {
        const weekStart = startOfWeek(weekPicker.valueAsDate || new Date());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return { weekStart: weekStart, weekEnd: weekEnd };
      }

      function colorForStaff(staffId) {
        if (!staffId) {
          return "#94a3b8";
        }
        const palette = ["#92d2a0", "#7b48b7", "#c84a50", "#fbbf24", "#38bdf8"];
        let hash = 0;
        for (let i = 0; i < staffId.length; i++) {
          hash = (hash + staffId.charCodeAt(i) * (i + 1)) % palette.length;
        }
        return palette[hash];
      }

      async function hydrateAdmin() {
        try {
          const response = await apiFetch("/admin/me");
          const data = await response.json();
          if (response.ok) {
            document.getElementById("adminName").textContent = data.username;
            document.getElementById("adminAvatar").textContent =
              data.username.slice(0, 2).toUpperCase();
          }
        } catch (error) {
          setStatus(error.message || "Auth error.", true);
        }
      }

      async function refreshStaff() {
        const businessId = getBusinessId();
        if (!businessId) {
          return;
        }
        try {
          const response = await apiFetch(
            "/admin/staff?businessId=" + encodeURIComponent(businessId)
          );
          const data = await response.json();
          if (!response.ok) {
            setStatus(data.error || "Unable to load staff.", true);
            return;
          }
          staffFilter.innerHTML = '<option value="">All staff</option>';
          (data.staff || []).forEach(function (staff) {
            const option = document.createElement("option");
            option.value = staff.id;
            option.textContent = staff.name;
            staffFilter.appendChild(option);
          });
        } catch (error) {
          setStatus(error.message || "Unable to load staff.", true);
        }
      }

      async function refreshCalendar() {
        const businessId = getBusinessId();
        if (!businessId) {
          setStatus("Business ID required.", true);
          return;
        }
        const range = getWeekRange();
        buildCalendarFrame(range.weekStart);
        const staffId = staffFilter.value;
        const query =
          "/admin/calendar?businessId=" +
          encodeURIComponent(businessId) +
          "&from=" +
          encodeURIComponent(range.weekStart.toISOString()) +
          "&to=" +
          encodeURIComponent(range.weekEnd.toISOString()) +
          (staffId ? "&staffId=" + encodeURIComponent(staffId) : "");

        try {
          const response = await apiFetch(query);
          const data = await response.json();
          if (!response.ok) {
            setStatus(data.error || "Unable to load calendar.", true);
            return;
          }
          appointmentCount.textContent =
            String(data.appointments.length) + " appointments";
          renderAppointments(range.weekStart, data.appointments || []);
        } catch (error) {
          setStatus(error.message || "Unable to load calendar.", true);
        }
      }

      function renderAppointments(weekStart, appointments) {
        const dayCols = calendarBody.querySelectorAll(".day-col");
        for (let i = 0; i < dayCols.length; i++) {
          dayCols[i].innerHTML = "";
        }

        appointments.forEach(function (appointment) {
          const start = new Date(appointment.startAt);
          const end = new Date(appointment.endAt);
          const dayIndex = Math.floor((start - weekStart) / (24 * 60 * 60 * 1000));
          if (dayIndex < 0 || dayIndex > 6) {
            return;
          }
          const minutesFromStart =
            (start.getHours() - hourStart) * 60 + start.getMinutes();
          const durationMinutes = Math.max(15, (end - start) / 60000);
          const top = (minutesFromStart / 60) * hourHeight;
          const height = (durationMinutes / 60) * hourHeight;
          if (top + height < 0 || top > (hourEnd - hourStart) * hourHeight) {
            return;
          }

          const event = document.createElement("div");
          event.className = "event";
          event.style.background = colorForStaff(appointment.staffId);
          event.style.top = String(top) + "px";
          event.style.height = String(height) + "px";
          const title = document.createElement("div");
          title.textContent = appointment.serviceName || "Appointment";
          const sub = document.createElement("small");
          sub.textContent = appointment.clientName || "Client";
          event.appendChild(title);
          event.appendChild(sub);
          dayCols[dayIndex].appendChild(event);
        });
      }

      function bootstrap() {
        const params = new URLSearchParams(window.location.search);
        const businessId = params.get("businessId");
        if (businessId) {
          businessInput.value = businessId;
        }
        const today = new Date();
        setWeek(today);
        buildCalendarFrame(startOfWeek(today));
        const token = getToken();
        if (token) {
          setStatus("Signed in. Token stored.", false);
          hydrateAdmin();
          refreshStaff();
          refreshCalendar();
        } else {
          setStatus("Not signed in.", true);
        }
      }

      loginBtn.addEventListener("click", login);
      logoutBtn.addEventListener("click", logout);
      businessInput.addEventListener("change", function () {
        refreshStaff();
        refreshCalendar();
      });
      staffFilter.addEventListener("change", refreshCalendar);
      weekPicker.addEventListener("change", function () {
        setWeek(weekPicker.valueAsDate || new Date());
        refreshCalendar();
      });
      document.getElementById("todayBtn").addEventListener("click", function () {
        setWeek(new Date());
        refreshCalendar();
      });
      bootstrap();
    </script>
  </body>
</html>
`;

export async function registerUiRoutes(app: FastifyInstance) {
  app.get("/booking", async (_request, reply) => {
    reply.type("text/html").send(bookingHtml);
  });

  app.get("/admin", async (_request, reply) => {
    reply.type("text/html").send(adminHtml);
  });
}
