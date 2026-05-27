import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

function db() {
  return getFirestore(getFirebaseAdminApp(), process.env.FIRESTORE_DATABASE_ID || "(default)");
}

function userDoc(userId: string) {
  return db().collection("users").doc(userId);
}

function fromTimestamp(value: any) {
  return value instanceof Timestamp ? value.toDate().toISOString() : value ?? null;
}

function docData(doc: FirebaseFirestore.DocumentSnapshot): Record<string, any> {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    ...data,
    createdAt: fromTimestamp(data.createdAt),
    updatedAt: fromTimestamp(data.updatedAt),
    date: fromTimestamp(data.date),
    resolvedAt: fromTimestamp(data.resolvedAt),
  };
}

export async function createProgressPhotoMetadata(userId: string, input: any) {
  const ref = userDoc(userId).collection("progressPhotos").doc();
  await ref.set({
    userId,
    cloudStoragePath: input.cloudStoragePath,
    isPublic: Boolean(input.isPublic),
    label: input.label ?? null,
    date: input.date ? Timestamp.fromDate(new Date(input.date)) : FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return docData(snap);
}

export async function listProgressPhotoMetadata(userId: string) {
  const snap = await userDoc(userId).collection("progressPhotos").orderBy("date", "desc").get();
  return snap.docs.map(docData);
}

export async function deleteProgressPhotoMetadata(userId: string) {
  const docs = await userDoc(userId).collection("progressPhotos").listDocuments();
  await Promise.all(docs.map((doc) => doc.delete()));
  return docs.length;
}

export async function createIssueReport(input: {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  page?: string | null;
  category?: string | null;
  message: string;
}) {
  const ref = db().collection("issueReports").doc();
  await ref.set({
    userId: input.userId ?? null,
    name: input.name ?? null,
    email: input.email ?? null,
    page: input.page ?? null,
    category: input.category ?? "issue",
    message: input.message,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

export async function listRecentIssueReports(limit = 50) {
  const snap = await db().collection("issueReports").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map(docData);
}

export async function deleteIssueReportsForUser(userId: string) {
  const snap = await db().collection("issueReports").where("userId", "==", userId).get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
  return snap.size;
}

export async function createReviewItemOnce(userId: string, data: { type: string; title: string; detail?: string; priority?: string; actionLabel?: string; payload?: any }) {
  const collection = userDoc(userId).collection("reviewItems");
  const existing = (await collection.get()).docs
    .map(docData)
    .find((item) => item.type === data.type && item.title === data.title && item.status === "open");
  if (existing) return existing;
  const ref = collection.doc();
  await ref.set({
    userId,
    type: data.type,
    title: data.title,
    detail: data.detail ?? null,
    status: "open",
    priority: data.priority ?? "normal",
    actionLabel: data.actionLabel ?? null,
    payload: data.payload ?? null,
    resolvedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return docData(snap);
}

export async function listReviewItems(userId: string, status = "open") {
  const snap = await userDoc(userId).collection("reviewItems").get();
  return snap.docs
    .map(docData)
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 100);
}

export async function getReviewItemCounts(userId: string) {
  const snap = await userDoc(userId).collection("reviewItems").get();
  const counts = new Map<string, number>();
  for (const doc of snap.docs) {
    const status = String(doc.data().status ?? "open");
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { id: count } }));
}

export async function updateReviewItemStatus(userId: string, id: string, status: string) {
  const ref = userDoc(userId).collection("reviewItems").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({
    status,
    resolvedAt: status === "open" ? null : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docData(await ref.get());
}

export async function deleteReviewItemsForUser(userId: string) {
  const docs = await userDoc(userId).collection("reviewItems").listDocuments();
  await Promise.all(docs.map((doc) => doc.delete()));
  return docs.length;
}
