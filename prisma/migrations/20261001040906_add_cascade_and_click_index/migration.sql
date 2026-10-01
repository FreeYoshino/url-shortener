-- DropForeignKey
ALTER TABLE "UrlClick" DROP CONSTRAINT "UrlClick_urlId_fkey";

-- CreateIndex
CREATE INDEX "Url_shortCode_idx" ON "Url"("shortCode");

-- CreateIndex
CREATE INDEX "UrlClick_urlId_idx" ON "UrlClick"("urlId");

-- AddForeignKey
ALTER TABLE "UrlClick" ADD CONSTRAINT "UrlClick_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "Url"("id") ON DELETE CASCADE ON UPDATE CASCADE;
