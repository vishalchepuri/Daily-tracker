export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

const SESSION_COOKIE_NAME = "dayza_firebase_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Firebase ID token is required" }, { status: 400 });

    const auth = getAuth(getFirebaseAdminApp());
    const decoded = await auth.verifyIdToken(idToken);
    if (!decoded?.uid) return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });

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
