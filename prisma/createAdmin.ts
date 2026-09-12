// Safe to run against a real production database — unlike `db:seed`, this
// only ever touches the one account it's given, never wipes anything.
// Usage: npm run create-admin -- <username> <password> [name]
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: npm run create-admin -- <username> <password> [name]");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash: hashPassword(password), role: "ADMIN" },
    create: {
      username,
      name: name || username,
      role: "ADMIN",
      passwordHash: hashPassword(password),
    },
  });
  console.log(`Admin account ready: ${user.username} (${user.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
