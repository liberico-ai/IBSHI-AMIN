// @ts-nocheck
/**
 * scripts/reset-passwords.ts
 *
 * Temporarily resets ALL user passwords to "123456" and clears forcePasswordChange.
 * Used for development / testing access.
 *
 * Usage:
 *   npx tsx scripts/reset-passwords.ts             # live
 *   npx tsx scripts/reset-passwords.ts --dry-run   # preview only
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

// Load env
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.resolve(__dirname, "..", f), "utf-8").split("\n")) {
      const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Reset All Passwords → "123456"`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const users = await prisma.user.findMany({
    select: { id: true, employeeCode: true, email: true },
  });

  console.log(`Found ${users.length} users to update`);

  if (DRY_RUN) {
    console.log("  [DRY] Would reset passwords for:");
    for (const u of users.slice(0, 10)) {
      console.log(`    ${u.employeeCode} (${u.email})`);
    }
    if (users.length > 10) console.log(`    ...and ${users.length - 10} more`);
  } else {
    const newHash = await hash("123456", 10);
    await prisma.user.updateMany({
      data: {
        passwordHash: newHash,
        forcePasswordChange: false,
      },
    });
    console.log(`  ✅ Reset ${users.length} passwords to "123456"`);
  }

  await prisma.$disconnect();
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
