-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "StockState" AS ENUM ('FULL', 'EMPTY');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('SITE', 'ROOM', 'COLD', 'TRAILER');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('RECEIPT', 'TRANSFER', 'CONSUME', 'RETURN', 'WRITE_OFF', 'ADJUST');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "microsoft_oid" TEXT,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "normalized_email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "last_login_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_flow_states" (
    "id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "pkce_verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "return_to" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_flow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "detail" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_id" UUID,
    "kind" "LocationKind" NOT NULL DEFAULT 'ROOM',
    "cooled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'Sonstiges',
    "unit" TEXT NOT NULL DEFAULT 'Stück',
    "returnable" BOOLEAN NOT NULL DEFAULT false,
    "deposit_cents" INTEGER NOT NULL DEFAULT 0,
    "needs_cooling" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" UUID NOT NULL,
    "batch_id" UUID,
    "kind" "MovementKind" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "article_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_location_id" UUID,
    "from_state" "StockState",
    "to_location_id" UUID,
    "to_state" "StockState",
    "supplier_id" UUID,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ui',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "state" "StockState" NOT NULL DEFAULT 'FULL',
    "from_location_id" UUID,
    "to_location_id" UUID NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "phase" TEXT,
    "note" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'OPEN',
    "done_movement_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoft_oid_key" ON "users"("microsoft_oid");

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_flow_states_state_hash_key" ON "auth_flow_states"("state_hash");

-- CreateIndex
CREATE INDEX "auth_flow_states_expires_at_idx" ON "auth_flow_states"("expires_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "movements_article_id_occurred_at_idx" ON "movements"("article_id", "occurred_at");

-- CreateIndex
CREATE INDEX "movements_from_location_id_idx" ON "movements"("from_location_id");

-- CreateIndex
CREATE INDEX "movements_to_location_id_idx" ON "movements"("to_location_id");

-- CreateIndex
CREATE INDEX "movements_occurred_at_idx" ON "movements"("occurred_at");

-- CreateIndex
CREATE INDEX "movements_batch_id_idx" ON "movements"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_done_movement_id_key" ON "plans"("done_movement_id");

-- CreateIndex
CREATE INDEX "plans_status_due_at_idx" ON "plans"("status", "due_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_done_movement_id_fkey" FOREIGN KEY ("done_movement_id") REFERENCES "movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Regeln, die die Datenbank selbst durchsetzt (zusätzlich zur Prüfung in der Anwendung) ───────────────────────────────
-- Eine Bewegung hat immer eine positive Menge und mindestens Quelle oder Ziel; Ort und Zustand gehören zusammen.
ALTER TABLE "movements" ADD CONSTRAINT "movements_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "movements" ADD CONSTRAINT "movements_has_from_or_to" CHECK ("from_location_id" IS NOT NULL OR "to_location_id" IS NOT NULL);
ALTER TABLE "movements" ADD CONSTRAINT "movements_from_pair" CHECK (("from_location_id" IS NULL) = ("from_state" IS NULL));
ALTER TABLE "movements" ADD CONSTRAINT "movements_to_pair" CHECK (("to_location_id" IS NULL) = ("to_state" IS NULL));
ALTER TABLE "movements" ADD CONSTRAINT "movements_void_pair" CHECK (("voided_at" IS NULL) = ("voided_by_id" IS NULL) OR "voided_by_id" IS NULL);
ALTER TABLE "plans" ADD CONSTRAINT "plans_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "articles" ADD CONSTRAINT "articles_deposit_nonnegative" CHECK ("deposit_cents" >= 0);
-- Kurzcode eines Lagerorts eindeutig, Groß-/Kleinschreibung egal (L004 = l004)
CREATE UNIQUE INDEX "locations_code_ci_key" ON "locations" (lower("code")) WHERE "code" IS NOT NULL;
-- Artikel- und Lieferantennamen eindeutig (ohne Beachtung der Schreibweise), solange nicht archiviert
CREATE UNIQUE INDEX "articles_name_ci_key" ON "articles" (lower("name")) WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "suppliers_name_ci_key" ON "suppliers" (lower("name")) WHERE "archived_at" IS NULL;
