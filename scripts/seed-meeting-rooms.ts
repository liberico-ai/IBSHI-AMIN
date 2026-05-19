// Seed 4 phòng họp mặc định
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const ROOMS = [
  { code: "BOM",  name: "Phòng BOM",          capacity: 9,  equipment: ["Wifi", "Tivi trình chiếu"] },
  { code: "P202", name: "Phòng 202",          capacity: 25, equipment: ["Wifi", "Máy chiếu", "Bảng trắng to"] },
  { code: "P302", name: "Phòng 302",          capacity: 30, equipment: ["Wifi", "Tivi trình chiếu", "Bảng trắng nhỏ"] },
  { code: "TT",   name: "Phòng Truyền Thống", capacity: 8,  equipment: ["Tivi trình chiếu"] },
];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const p = new PrismaClient({ adapter: new PrismaPg(pool) });
  for (const r of ROOMS) {
    const ex = await p.meetingRoom.findUnique({ where: { code: r.code } });
    if (ex) { console.log(`⏭ "${r.name}" đã tồn tại`); continue; }
    await p.meetingRoom.create({ data: r });
    console.log(`✓ Tạo "${r.name}" (sức chứa ${r.capacity})`);
  }
  await p.$disconnect();
})();
