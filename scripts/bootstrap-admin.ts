import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/db";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

function fail(message: string): never {
  throw Object.assign(new Error(message), { expected: true });
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    fail(`BOOTSTRAP_ADMIN_PASSWORD must be at most ${MAX_PASSWORD_BYTES} bytes (bcrypt limit).`);
  }
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Campus Admin";

  if (!email || !email.includes("@")) {
    fail("BOOTSTRAP_ADMIN_EMAIL is required and must be a valid email address.");
  }
  if (!password) {
    fail("BOOTSTRAP_ADMIN_PASSWORD is required.");
  }
  validatePassword(password);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true }
  });
  if (existing) {
    fail(`A user with email ${email} already exists. No changes were made.`);
  }

  await prisma.user.create({
    data: {
      name,
      email,
      role: "ADMIN",
      passwordHash: await hashPassword(password)
    }
  });

  console.log(`Created admin account for ${email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    if (error instanceof Error && (error as Error & { expected?: boolean }).expected) {
      console.error(error.message);
    } else {
      console.error("Bootstrap admin failed:", error instanceof Error ? error.message : "unknown error");
    }
    await prisma.$disconnect();
    process.exit(1);
  });
