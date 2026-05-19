// Seed 2 NCC mặc định: Super MRO + BTcom
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const p = new PrismaClient({ adapter: new PrismaPg(pool) });
  const suppliers = ["Super MRO", "BTcom"];
  for (const name of suppliers) {
    const ex = await p.stationerySupplier.findUnique({ where: { name } });
    if (ex) { console.log(`⏭ "${name}" đã tồn tại`); continue; }
    await p.stationerySupplier.create({ data: { name } });
    console.log(`✓ Tạo "${name}"`);
  }
  await p.$disconnect();
})();
