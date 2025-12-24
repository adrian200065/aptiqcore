# Aptiq Scheduling

Scheduling platform inspired by Acuity's workflow: availability engine, public booking, and an admin calendar.

## Quick start

```bash
cd server
npm install
```

Set environment variables in `server/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/aptiqcore"
ADMIN_SEED_USER="admin"
ADMIN_SEED_PASSWORD="your-password"
ADMIN_TOKEN_TTL_MINUTES=60
```

Apply migrations and seed demo data:

```bash
cd server
npx prisma migrate dev
npm run seed
```

Run the API:

```bash
cd server
npm run dev
```

## URLs

- Public booking UI: `http://localhost:3000/booking`
- Admin calendar: `http://localhost:3000/admin`

## Tests

```bash
cd server
npm test
```
