import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./firebase-storage";

export async function verifyFirebaseIdToken(idToken?: string | null) {
  const token = String(idToken ?? "").trim();
  if (!token) return null;
  const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email?.trim().toLowerCase() ?? null,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
    emailVerified: Boolean(decoded.email_verified),
  };
}
