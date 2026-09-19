-- Rename `Url.shortUrl` to `Url.shortCode`.
--
-- Hand-written rather than generated: for a rename Prisma's schema diff emits
-- DROP COLUMN + ADD COLUMN, which destroys every stored short code. A plain
-- RENAME COLUMN preserves the data.
ALTER TABLE "Url" RENAME COLUMN "shortUrl" TO "shortCode";

-- PostgreSQL does not rename an index when its column is renamed, and Prisma
-- compares index names when detecting drift, so rename it explicitly.
ALTER INDEX "Url_shortUrl_key" RENAME TO "Url_shortCode_key";
