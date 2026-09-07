import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getEnv } from "../env";

export async function runMigrations(migrationsFolder?: string) {
  const { DATABASE_URL } = getEnv();
  const here = dirname(fileURLToPath(import.meta.url));
  const folder = migrationsFolder ?? resolve(here, "../../drizzle");
  const sql = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: folder });
  await sql.end();
}

if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
