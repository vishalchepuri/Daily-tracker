export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";

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
    const existing = await prisma.account.findFirst({ where: { userId: user.id, provider: "google" } });
    if (existing) {
      const account = await prisma.account.update({
        where: { id: existing.id },
        data: {
          type: "oauth",
          providerAccountId,
          access_token: accessToken,
          expires_at: Math.floor(Date.now() / 1000) + 3500,
          token_type: "Bearer",
          scope: mergeScopes(existing.scope, scope, "openid email profile"),
        },
      });
      return NextResponse.json({ account: { id: account.id, scope: account.scope } });
    }

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId,
        access_token: accessToken,
        expires_at: Math.floor(Date.now() / 1000) + 3500,
        token_type: "Bearer",
        scope: mergeScopes(scope, "openid email profile"),
      },
    });
    return NextResponse.json({ account: { id: account.id, scope: account.scope } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to connect Google" }, { status: 500 });
  }
}
