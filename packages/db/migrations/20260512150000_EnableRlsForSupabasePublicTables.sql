ALTER TABLE "user_board_favorites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_slugs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "user_board_favorites" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "workspace_slugs" FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE "user_board_favorites" TO service_role;
--> statement-breakpoint
GRANT ALL ON TABLE "workspace_slugs" TO service_role;
