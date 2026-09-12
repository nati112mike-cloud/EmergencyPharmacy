# Multi-stage build for self-hosting (Docker Compose). Vercel deploys don't
# use this file at all — it builds straight from source there.

FROM node:20-alpine AS deps
# Prisma's query engine needs OpenSSL; alpine doesn't ship it by default.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL isn't reachable at build time (no DB container exists yet) —
# `prisma generate` only needs it present, not connectable. Migrations run
# at container start instead (docker-entrypoint.sh), once the db service is
# actually up; `npm run build` (used for Vercel) bundles migrate+build
# together, which doesn't work here, so call `next build` directly.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npx next build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# The standalone server (from the "standalone" output) plus its static
# assets. The entrypoint needs the full `prisma` CLI for `migrate deploy` at
# startup, which the standalone trace doesn't include (it only bundles what
# the running app imports, not a separate CLI tool) — so node_modules comes
# from `builder` in full (which has both the CLI *and* the generated
# @prisma/client output from `prisma generate` above) rather than the
# trimmed standalone copy or the pre-generate `deps` one.
# (No public/ directory exists in this project yet — add a COPY line for it
# here if you ever add static assets under public/.)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
