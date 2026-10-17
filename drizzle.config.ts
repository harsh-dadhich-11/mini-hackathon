import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations need a session connection: Supabase's direct or session-pooler URL (port 5432).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
