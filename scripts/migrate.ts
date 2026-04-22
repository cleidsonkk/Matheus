import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada");
  }

  const sql = neon(process.env.DATABASE_URL);
  const schema = await readFile(path.resolve("sql", "schema.sql"), "utf8");
  await sql.query(schema);
  console.log("Migração aplicada com sucesso.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
