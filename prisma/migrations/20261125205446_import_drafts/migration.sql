-- CreateTable
CREATE TABLE "import_drafts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "sheets" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_drafts_user_id_idx" ON "import_drafts"("user_id");

-- CreateIndex
CREATE INDEX "import_drafts_created_at_idx" ON "import_drafts"("created_at");

-- AddForeignKey
ALTER TABLE "import_drafts" ADD CONSTRAINT "import_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
