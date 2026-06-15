# Phase 3 Database Setup

This project uses PostgreSQL installed directly on the VPS or local machine, plus Prisma migrations.

## Local/Postgres Commands

Create a database and user matching `.env`, then run:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

## Local Windows Portable PostgreSQL

For this workspace, PostgreSQL 17 binaries and the local data directory live under `.local-tools/` and are ignored by git.

Start the local database:

```powershell
.\.local-tools\postgresql-17\pgsql\bin\pg_ctl.exe -D .\.local-tools\pgdata -l .\.local-tools\postgres.log -o "-p 5432" start
```

Stop the local database:

```powershell
.\.local-tools\postgresql-17\pgsql\bin\pg_ctl.exe -D .\.local-tools\pgdata stop
```

The local credentials match `.env`:

- Database: `campus_food`
- User: `campus_food`
- Password: `password`
- Port: `5432`

Seeded users:

- Admin: `admin@campus.local` / `admin123`
- Delivery: `delivery@campus.local` / `delivery123`

## Current Phase 3 Status

- Initial Prisma migration exists at `prisma/migrations/20260614153000_init/migration.sql`.
- Seed data creates system settings, one admin, one delivery user, one restaurant, courses, and sample items.
- Admin menu APIs and UI are ready to test once PostgreSQL is running.

Do not use Docker for the database. Install PostgreSQL directly, matching the final VPS deployment plan.
