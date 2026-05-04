ALTER TABLE "card" ALTER COLUMN "priority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "card" ALTER COLUMN "priority" DROP NOT NULL;--> statement-breakpoint
UPDATE "card" SET "priority" = NULL WHERE "priority" = 'medium';
