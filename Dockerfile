# syntax=docker/dockerfile:1.6
# ────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install from lockfile, pre-copy prisma schema for generate
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# openssl + libc6-compat required by Prisma engines on alpine
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — generate Prisma client + build Next.js (standalone)
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma config.ts truyền `datasource.url: process.env.DATABASE_URL` cho Prisma
# CLI. Dummy URL này chỉ phục vụ `prisma generate` và `next build` trong
# container — runtime connection thực tế đến từ `.env` khi `docker compose up`.
# pg.Pool lazy, không connect nên hostname không cần giải được.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-time-placeholder-not-used-at-runtime-xxxx"

# Prisma client must be generated before `next build`
RUN npx prisma generate

# Build Next.js — emits .next/standalone (minimal server + pruned deps)
RUN npm run build

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — production image
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production

# ── Next.js standalone runtime ──────────────────────────────────────────────
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ── Prisma: schema, migrations, and generated client for db:push / seed ────
# Standalone tracer already ships @prisma/client engine, but we keep the full
# prisma tooling + schema so `docker compose exec app npx prisma migrate deploy`
# and `npm run db:seed` work on the lab host.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

ARG GIT_HASH=unknown
ARG BUILD_TIME=unknown
ENV GIT_HASH=${GIT_HASH}
ENV BUILD_TIME=${BUILD_TIME}

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Run Next.js standalone server directly (no npm wrapper)
CMD ["node", "server.js"]
