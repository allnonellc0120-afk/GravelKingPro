import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
// Silence pg-connection-string v3 SSL mode warnings in production
if (databaseUrl.searchParams.has("sslmode")) {
  const mode = databaseUrl.searchParams.get("sslmode");
  if (mode && mode !== "verify-full") {
    databaseUrl.searchParams.set("sslmode", "verify-full");
  }
}
export const pool = new Pool({ connectionString: databaseUrl.toString() });
export const db = drizzle(pool, { schema });

export * from "./schema";
