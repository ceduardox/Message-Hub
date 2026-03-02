import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

try {
  (process as any).loadEnvFile?.(".env");
} catch {
  // Ignore if unavailable in current runtime
}

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Database connection will fail.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
