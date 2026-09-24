import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/db";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

function fail(message: string): never {
  throw Object.assign(new Error(message), { expected: true });
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`STAFF_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    fail(`STAFF_PASSWORD must be at most ${MAX_PASSWORD_BYTES} bytes (bcrypt limit).`);
  }
}

async function main() {
  const email = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const password = process.env.STAFF_PASSWORD;

  if (!email) {
    fail("STAFF_EMAIL is required.");
  }
  if (!password) {
    fail("STAFF_PASSWORD is required.");
  }
  validatePassword(password);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true }
  });
  if (!user) {
    fail(`No user found with email ${email}. No account was created.`);
  }

  const passwordHash = await hashPassword(password);

  const [, appSessions, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.appSession.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } })
  ]);

  console.log(
    `Password reset for ${email}. Revoked ${appSessions.count} app session(s) and ${sessions.count} auth session(s).`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    if (error instanceof Error && (error as Error & { expected?: boolean }).expected) {
      console.error(error.message);
    } else {
      console.error("Password reset failed:", error instanceof Error ? error.message : "unknown error");
    }
    await prisma.$disconnect();
    process.exit(1);
  });
