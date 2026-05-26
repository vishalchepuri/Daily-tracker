export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";
import { getBlockedEmailMessage, isBlockedEmailDomain } from "@/lib/email-domain-guard";

const SESSION_COOKIE_NAME = "dayza_firebase_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  try {
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

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
    return NextResponse.json({ error: error?.message ?? "Could not create Firebase session" }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
