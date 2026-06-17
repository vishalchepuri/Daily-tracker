export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";
import { getBlockedEmailMessage, isBlockedEmailDomain } from "@/lib/email-domain-guard";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const SESSION_COOKIE_NAME = "dayza_firebase_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function shouldUseSecureCookie(req: Request) {
  const host = req.headers.get("host") ?? "";
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "";
  const requestProto = new URL(req.url).protocol.replace(":", "");
  const isLocalhost = /(^localhost(:\d+)?$)|(^127\.0\.0\.1(:\d+)?$)|(^\[::1\](:\d+)?$)/i.test(host);
  return !isLocalhost && (process.env.NODE_ENV === "production" || forwardedProto.split(",")[0]?.trim() === "https" || requestProto === "https");
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, "firebase-session", { limit: 40, windowMs: 10 * 60 * 1000 });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Firebase ID token is required" }, { status: 400 });

    const auth = getAuth(getFirebaseAdminApp());
    const decoded = await auth.verifyIdToken(idToken);
    if (!decoded?.uid) return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
    if (decoded.email && isBlockedEmailDomain(decoded.email)) {
      return NextResponse.json({ error: getBlockedEmailMessage(decoded.email) }, { status: 403 });
    }
    const signInProvider = decoded.firebase?.sign_in_provider;
    if (signInProvider === "password" && !decoded.email_verified) {
      return NextResponse.json({ error: "Email address is not verified" }, { status: 401 });
    }
    const email = normalizeEmail(decoded.email);
    if (!email) return NextResponse.json({ error: "Firebase account does not include an email address" }, { status: 401 });

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: decoded.name ?? undefined,
      },
      create: {
        email,
        name: decoded.name ?? email.split("@")[0],
      },
      select: { id: true },
    });

    if (signInProvider === "google.com") {
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: decoded.uid,
          },
        },
        update: { userId: user.id },
        create: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: decoded.uid,
        },
      });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: shouldUseSecureCookie(req),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error: any) {
    if (error?.message === "FIREBASE_SERVICE_ACCOUNT_JSON is required in production") {
      return NextResponse.json(
        { error: "Server Firebase credentials are not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON in Vercel." },
        { status: 500 }
      );
    }
    const message =
      process.env.NODE_ENV === "production"
        ? "Could not create Firebase session"
        : error?.message ?? "Could not create Firebase session";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
