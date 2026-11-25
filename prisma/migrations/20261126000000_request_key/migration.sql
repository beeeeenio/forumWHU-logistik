-- AlterTable
ALTER TABLE "movements" ADD COLUMN     "request_index" INTEGER,
ADD COLUMN     "request_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "movements_request_key_request_index_key" ON "movements"("request_key", "request_index");

