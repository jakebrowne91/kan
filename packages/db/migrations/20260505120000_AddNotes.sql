CREATE TABLE "note" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"workspaceId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "note_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "note_workspace_updated_idx" ON "note" USING btree ("workspaceId","updatedAt");
