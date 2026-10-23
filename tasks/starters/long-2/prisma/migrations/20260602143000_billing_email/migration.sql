-- TW-1207: organisations get a billing contact, filled in from the owner's
-- account for the rows that already exist.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "billing_email" TEXT;

-- Backfill
UPDATE "organizations" o
SET "billing_email" = owners."email"
FROM "organization_owners" owners
WHERE owners."organization_id" = o."id" AND o."billing_email" IS NULL;
