CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"root_file" text DEFAULT 'main.tex' NOT NULL,
	"output_version" integer DEFAULT 0 NOT NULL,
	"has_pdf" boolean DEFAULT false NOT NULL,
	"label" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"commit_hash" text NOT NULL,
	"message" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"description" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_updated_idx" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "revisions_project_idx" ON "revisions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "share_project_idx" ON "share_links" USING btree ("project_id");