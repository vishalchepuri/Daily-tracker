import { cookies, headers } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { prisma } from "@/lib/db";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

export const FIREBASE_SESSION_COOKIE = "dayza_firebase_session";

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export function isAdminEmail(email?: string | null) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && admins.includes(email.toLowerCase()));
}

async function getFirebaseTokenFromRequest() {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return { type: "idToken" as const, value: authorization.slice(7).trim() };
  }

  const requestCookies = await cookies();
  const sessionCookie = requestCookies.get(FIREBASE_SESSION_COOKIE)?.value;
  if (sessionCookie) return { type: "sessionCookie" as const, value: sessionCookie };
  return null;
}

export async function requireCurrentUser() {
  const token = await getFirebaseTokenFromRequest();
  if (!token?.value) return null;

  try {
    const auth = getAuth(getFirebaseAdminApp());
    const decoded = token.type === "sessionCookie"
      ? await auth.verifySessionCookie(token.value, true)
      : await auth.verifyIdToken(token.value);
    const email = normalizeEmail(decoded.email);
    if (!email) return null;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: decoded.name ?? undefined,
      },
      create: {
        email,
        name: decoded.name ?? email.split("@")[0],
      },
      select: { id: true, email: true, name: true },
    });
    return user;
  } catch (error) {
    console.warn("Firebase auth verification failed", error);
    return null;
  }
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
