CREATE TYPE "card_agent_run_status" AS ENUM ('requested', 'running', 'failed');

CREATE TABLE "card_agent_run" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "publicId" varchar(12) NOT NULL,
  "cardId" bigint NOT NULL,
  "createdBy" uuid,
  "agent" varchar(64) NOT NULL,
  "status" "card_agent_run_status" DEFAULT 'requested' NOT NULL,
  "supersetWorkspaceId" text,
  "supersetSessionId" text,
  "supersetUrl" text,
  "prompt" text NOT NULL,
  "response" jsonb,
  "error" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp,
  CONSTRAINT "card_agent_run_publicId_unique" UNIQUE("publicId"),
  CONSTRAINT "card_agent_run_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "card_agent_run_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX "card_agent_run_card_created_idx" ON "card_agent_run" USING btree ("cardId", "createdAt");
