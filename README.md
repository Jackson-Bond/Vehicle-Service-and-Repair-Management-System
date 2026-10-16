## USES:

React (Vite), Node.js/Express, PostgreSQL (Prisma), JWT auth with bcrypt-hashed PINs

## Prerequisites

- Node.js 18 or newer
- Docker (runs PostgreSQL)
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

Create the tables and load sample data:

```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.js
```

### 3. Set up the client folder

```bash
cd client
npm install
npm install react-router-dom
```

## Running the app

Use two terminals (the database docker container must already be running):

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

The seed script creates two shops. On a fresh database, Bobs Auto Care is shop `1` and Freds Garage is shop `2`.

| Shop ID | Employee code | PIN    | Role       |
|---------|---------------|--------|------------|
| 1       | 1001        | 123456 | manager    |
| 1       | 1002         | 234567 | advisor    |
| 1       | 1003         | 345678 | technician |
| 2       | 1001      | 123456 | manager    |
| 2       | 1002        | 456789 | technician |


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
/client        React and Vite frontend
/server
  /prisma      schema.prisma, migrations, seed.js
  /src
    /lib         Prisma client
    /middleware  authenticate, requireRole
    /routes      auth, customers
docker-compose.yml
```