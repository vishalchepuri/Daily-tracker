export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { requireCurrentFirebaseUser, FIREBASE_SESSION_COOKIE } from "@/lib/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

function shouldUseSecureCookie(req: Request) {
  const host = req.headers.get("host") ?? "";
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "";
  const requestProto = new URL(req.url).protocol.replace(":", "");
  const isLocalhost = /(^localhost(:\d+)?$)|(^127\.0\.0\.1(:\d+)?$)|(^\[::1\](:\d+)?$)/i.test(host);
  return !isLocalhost && (process.env.NODE_ENV === "production" || forwardedProto.split(",")[0]?.trim() === "https" || requestProto === "https");
}

export async function POST(req: Request) {
  const user = await requireCurrentFirebaseUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await getAuth(getFirebaseAdminApp()).revokeRefreshTokens(user.firebaseUid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(FIREBASE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
