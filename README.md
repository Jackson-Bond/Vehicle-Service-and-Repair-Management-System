# Vehicle Shop Manager

Vehicle Service and Repair Management System for CSE 5324-001, Fall 2026.

A web app for independent auto repair shops. Managers and technicians log in with a shop ID, employee code and PIN and run each job from the service request to a paid invoice. Several shops can use the same system, and each shop only sees its own data.

**Team:** Jackson Bond, Elsheikh Mohamed, Kshitij Karkera

**Uses:** React (Vite), Node.js/Express, PostgreSQL 16 (Prisma), JWT login with bcrypt-hashed PINs

## Prerequisites

- Node.js 18 or newer
- Docker (runs PostgreSQL), or any local PostgreSQL 16 whose connection string you put in `DATABASE_URL`
- Git

## Setup for first time usage

### 1. Start the database

From the repo root:

```bash
docker compose up -d
```

### 2. Set up the server folder

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```
DATABASE_URL="postgresql://shopmanager:devpassword@localhost:5432/shopmanager_dev"
JWT_SECRET=<paste a long random string>
PORT=4000
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server will not start without `JWT_SECRET`.

Create the tables and load sample data (the first run downloads the Prisma engines, so it needs internet access):

```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.js
```

### 3. Set up the client folder

From the repo root:

```bash
cd client
npm install
```

## Running the app

Use two terminals (the database container must already be running):

```bash
# Terminal 1: API on http://localhost:4000
cd server
node src/index.js

# Terminal 2: frontend on http://localhost:5173
cd client
npm run dev
```

Open http://localhost:5173.

## Sample logins

The seed script creates two shops. On a fresh database, Bobs Auto Care is shop `1` and Freds Garage is shop `2`. Jane Manager works at both.

| Shop ID | Employee code | PIN    | Name            | Role       |
|---------|---------------|--------|-----------------|------------|
| 1       | 1001          | 123456 | Jane Manager    | manager    |
| 1       | 1002          | 234567 | Sam Technician  | technician |
| 1       | 1003          | 345678 | Tom Technician  | technician |
| 2       | 1001          | 123456 | Jane Manager    | manager    |
| 2       | 1002          | 456789 | Rita Technician | technician |

These are for local testing only. Change the PINs before any real use.

## Email

Customer notifications go through the `messaging/` module, and every attempt is written to `notification_log` (shown on each work order). By default (`MESSAGING_DRIVER=console`) messages are only logged. To send them for real, set `MESSAGING_DRIVER=live` and fill in the `SMTP_*` and `EMAIL_FROM` values in `server/.env` (see `.env.example`).

## Tests

The tests are in the `test/` folder at the repo root and are run from `server/`. All tests use the seed data, so reseed first. The end-to-end and API tests need the server running.

```bash
cd server
npm test              # unit tests for the estimate and tax maths (3 tests)
npm run seed
npm run test:e2e      # full workflow from service request to closed job (39 checks)
npm run seed
npm run test:api      # registration, search, VIN, role and parts inventory checks (15 checks)
```

Saved output of a full run is in `docs/test-unit.txt`, `docs/test-e2e.txt` and `docs/test-api.txt`.

## Useful commands

| Task | Command (run in `server/`) |
|------|----------------------------|
| Reseed (deletes and reloads sample data) | `node prisma/seed.js` |
| Reset the database completely | `npx prisma migrate reset` |
| Browse the database in a GUI | `npx prisma studio` |
| Create a migration after editing `schema.prisma` | `npx prisma migrate dev --name <description>` |
| Stop the database, keep data | `docker compose down` |
| Stop the database and delete all data | `docker compose down -v` |

## Project structure

```
client/
  src/
    pages/        one file per screen (work orders, customers, vehicles, parts, staff, audit log)
    components/   Layout (top bar and nav), ServiceHistory, StatusBadge
    App.jsx       routes and saved login
    api.js        fetch wrapper that adds and renews the login token
server/
  prisma/         schema.prisma, migrations, seed.js
  src/
    routes/       auth, customers, vehicles, workOrders, invoice, parts, services, users, shop, audit
    middleware/   authenticate, requireRole
    messaging/    notify, templates, transports (console or SMTP)
    lib/          Prisma client, audit log helper
    workOrderStatus.js, estimate.js, statusChange.js, serviceHistory.js
test/             estimate.test.mjs, workflow.e2e.mjs, api.checks.mjs
docs/             saved test output
docker-compose.yml
```

## API routes (all under `/api`)

- Auth and users: `POST /auth/login`, `GET` and `POST /users`, `PATCH /users/:id`
- Customers and vehicles: `/customers` and `/vehicles` for create, search, view, edit and history
- Work orders: create, list, view, status change, check-in, diagnosis, services, parts, approvals, `PATCH /work-orders/:id/technician`, `GET /work-orders/:id/history`, `GET /work-orders/:id/notifications`
- Invoices: `POST` and `GET /work-orders/:id/invoice`, `GET /work-orders/:id/invoice/pdf`, `POST /work-orders/:id/invoice/email`, `PATCH /work-orders/:id/invoice/payment`
- Shop, catalog and audit: `GET` and `PATCH /shop`, `/parts`, `GET /services`, `GET /audit`

Manager only: staff, audit log, assigning technicians, recording approvals, invoices and parts editing.