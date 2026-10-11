import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
    const r = await p.$queryRaw`SELECT 1`;
    console.log("OK:", r);
} catch (e) {
    console.error("FAIL:", e.message);
} finally {
    await p.$disconnect();
}
