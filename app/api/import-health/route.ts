export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

function hasScope(scope: string | null | undefined, needed: string) {
  return Boolean(scope?.split(/\s+/).includes(needed));
}

function connectionStatus(account: any, scope: string) {
  if (!account) {
    return { connected: false, status: "not_connected", label: "Not connected", needsReconnect: true };
  }
  const hasNeededScope = hasScope(account.scope, scope);
  const expiresAt = account.expires_at ? new Date(account.expires_at * 1000).toISOString() : null;
  const expired = Boolean(account.expires_at && account.expires_at < Math.floor(Date.now() / 1000));
  if (!account.access_token || !hasNeededScope) {
    return { connected: false, status: "missing_permission", label: "Needs permission", needsReconnect: true, expiresAt };
  }
  if (expired && !account.refresh_token) {
    return { connected: false, status: "expired", label: "Expired", needsReconnect: true, expiresAt };
  }
  if (expired) {
    return { connected: true, status: "refresh_needed", label: "Refresh needed", needsReconnect: false, expiresAt };
  }
  return { connected: true, status: "connected", label: "Connected", needsReconnect: false, expiresAt };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const googleAccounts = await prisma.account.findMany({
    where: { userId, provider: "google" },
    orderBy: { id: "desc" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true, scope: true },
  });

  const gmailAccount = googleAccounts.find((account) => hasScope(account.scope, GMAIL_SCOPE)) ?? googleAccounts[0] ?? null;
  const youtubeAccount = googleAccounts.find((account) => hasScope(account.scope, YOUTUBE_SCOPE)) ?? googleAccounts[0] ?? null;

  return NextResponse.json({
    gmail: {
      ...connectionStatus(gmailAccount, GMAIL_SCOPE),
    },
    youtube: {
      ...connectionStatus(youtubeAccount, YOUTUBE_SCOPE),
    },
  });
}
