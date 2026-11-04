import { createPrismaClient } from "@/server/db";

/** Owner connection for test fixtures that need to bypass the app role (still needs platform scope: FORCE RLS). */
export const ownerClient = () => createPrismaClient(process.env.DIRECT_DATABASE_URL);
