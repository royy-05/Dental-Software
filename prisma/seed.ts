import { createPrismaClient } from "../src/server/db";
import { seedDatabase } from "../src/server/seed";

async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const client = createPrismaClient(url);
  const started = Date.now();
  const result = await seedDatabase({ client });
  console.log(`Seeded ${result.clinics} clinics, ${result.users} users, ${result.appointments} appointments in ${Date.now() - started} ms`);
  await client.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
