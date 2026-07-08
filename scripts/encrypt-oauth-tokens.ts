import { prisma } from "../lib/db";
import { encryptOAuthTokenFields, isEncryptedOAuthToken } from "../lib/oauth-token-encryption";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const accounts = await prisma.account.findMany({
    where: {
      provider: "google",
      OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }, { id_token: { not: null } }],
    },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      id_token: true,
    },
  });

  let changed = 0;
  let alreadyEncrypted = 0;

  for (const account of accounts) {
    const hadEncryptedToken =
      isEncryptedOAuthToken(account.access_token) ||
      isEncryptedOAuthToken(account.refresh_token) ||
      isEncryptedOAuthToken(account.id_token);
    if (hadEncryptedToken) alreadyEncrypted += 1;

    const encrypted = encryptOAuthTokenFields({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      id_token: account.id_token,
    });
    const needsUpdate =
      encrypted.access_token !== account.access_token ||
      encrypted.refresh_token !== account.refresh_token ||
      encrypted.id_token !== account.id_token;

    if (!needsUpdate) continue;
    changed += 1;

    if (!dryRun) {
      await prisma.account.update({
        where: { id: account.id },
        data: encrypted,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedGoogleAccounts: accounts.length,
        alreadyEncrypted,
        updated: dryRun ? 0 : changed,
        wouldUpdate: dryRun ? changed : 0,
        dryRun,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
