export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { encryptOAuthTokenFields } from "@/lib/oauth-token-encryption";

function mergeScopes(...scopes: Array<string | null | undefined>) {
  return Array.from(new Set(scopes.flatMap((scope) => scope?.split(/\s+/).filter(Boolean) ?? []))).join(" ");
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    const accessToken = String(data?.accessToken ?? "").trim();
    const scope = String(data?.scope ?? "").trim();
    if (!accessToken || !scope) return NextResponse.json({ error: "Google access token and scope are required" }, { status: 400 });

    const providerAccountId = String(data?.providerAccountId ?? user.email ?? user.id);
    const existingAccounts = await prisma.account.findMany({ where: { userId: user.id, provider: "google" } });
    const mergedScope = mergeScopes(...existingAccounts.map((account) => account.scope), scope, "openid email profile");

    if (existingAccounts.length > 0) {
      const encryptedTokens = encryptOAuthTokenFields({ access_token: accessToken });
      await prisma.account.updateMany({
        where: { userId: user.id, provider: "google" },
        data: {
          type: "oauth",
          ...encryptedTokens,
          refresh_token: null,
          id_token: null,
          session_state: null,
          expires_at: Math.floor(Date.now() / 1000) + 3500,
          token_type: "Bearer",
          scope: mergedScope,
        },
      });

      const exactAccount = existingAccounts.find((account) => account.providerAccountId === providerAccountId);
      const account = exactAccount
        ? await prisma.account.findUnique({ where: { id: exactAccount.id } })
        : existingAccounts[0];
      return NextResponse.json({ account: { id: account?.id, scope: mergedScope } });
    }

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId,
        ...encryptOAuthTokenFields({ access_token: accessToken }),
        refresh_token: null,
        id_token: null,
        session_state: null,
        expires_at: Math.floor(Date.now() / 1000) + 3500,
        token_type: "Bearer",
        scope: mergedScope,
      },
    });
    return NextResponse.json({ account: { id: account.id, scope: account.scope } });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to connect Google" : error?.message ?? "Failed to connect Google" }, { status: 500 });
  }
}
