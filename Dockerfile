# nexify-ai — single-stage image for local/Docker runs.
# (For a slim prod image you'd split build/runtime stages, but this keeps
#  drizzle-kit available so the container can run migrations on start.)
FROM node:20-slim

# pnpm via corepack, pinned to the project's version
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Install dependencies (cached layer). Patches are referenced by package.json.
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Copy the rest and build the client + server bundle
COPY . .
RUN pnpm build

EXPOSE 5000

# Sync the schema to the DB then start the server.
# NOTE: uses `push` (schema.ts → DB) rather than `migrate` because the committed
# migration history has duplicate CREATE TABLE statements (0017/0018 both create
# stripe_payment_intents & subscription_plans) that make `migrate` fail. `push`
# applies drizzle/schema.ts directly and is idempotent for this local/demo run.
CMD ["sh", "-c", "pnpm drizzle-kit push --force && node dist/index.js"]
