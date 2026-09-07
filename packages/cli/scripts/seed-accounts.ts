import { randomUUID } from "crypto";
import { getDb, closeDb, schema } from "@miel/core";

function uuid() {
  return randomUUID();
}

async function main() {
  const { db } = getDb();

  const id1 = uuid();
  const id2 = uuid();

  await db.insert(schema.accounts).values([
    { id: id1, email: "test1@example.com" },
    { id: id2, email: "test2@example.com" },
  ]);

  console.log("Seeded test accounts");
  console.log(`  Account 1: ${id1} test1@example.com`);
  console.log(`  Account 2: ${id2} test2@example.com`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
