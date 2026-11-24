-- CreateTable
CREATE TABLE "movement_attachments" (
    "id" UUID NOT NULL,
    "movement_id" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movement_attachments_movement_id_idx" ON "movement_attachments"("movement_id");

-- AddForeignKey
ALTER TABLE "movement_attachments" ADD CONSTRAINT "movement_attachments_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
