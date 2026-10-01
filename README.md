After cloning do these to set up:
(Make sure you have docker desktop installed and running)
docker compose up -d
cd server
npm ci
Copy .env.example to .env and set DATABASE_URL
npx prisma generate
npx prisma migrate dev