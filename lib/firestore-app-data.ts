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
    savedAt: fromTimestamp(data.savedAt),
    lastViewedAt: fromTimestamp(data.lastViewedAt),
  };
}

export async function upsertYoutubeLearningItem(userId: string, videoId: string, input: any) {
  const ref = userDoc(userId).collection("youtubeLearning").doc(videoId);
  const existing = await ref.get();
  await ref.set(
    {
      userId,
      videoId,
      title: input.title ?? null,
      channelTitle: input.channelTitle ?? null,
      thumbnail: input.thumbnail ?? null,
      summary: input.summary ?? "",
      source: input.source ?? null,
      category: input.category ?? "other",
      status: input.status ?? "saved",
      notes: input.notes ?? "",
      takeaways: Array.isArray(input.takeaways) ? input.takeaways.filter(Boolean).slice(0, 8) : [],
      nextAction: input.nextAction ?? "",
      savedAt: existing.exists ? existing.data()?.savedAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      lastViewedAt: input.lastViewedAt ? Timestamp.fromDate(new Date(input.lastViewedAt)) : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return docData(await ref.get());
}

export async function listYoutubeLearningItems(userId: string) {
  const snap = await userDoc(userId).collection("youtubeLearning").orderBy("updatedAt", "desc").get();
  return snap.docs.map(docData);
}

export async function updateYoutubeLearningItem(userId: string, videoId: string, input: any) {
  const ref = userDoc(userId).collection("youtubeLearning").doc(videoId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.set(
    {
      title: input.title ?? snap.data()?.title ?? null,
      channelTitle: input.channelTitle ?? snap.data()?.channelTitle ?? null,
      thumbnail: input.thumbnail ?? snap.data()?.thumbnail ?? null,
      summary: input.summary ?? snap.data()?.summary ?? "",
      source: input.source ?? snap.data()?.source ?? null,
      category: input.category ?? snap.data()?.category ?? "other",
      status: input.status ?? snap.data()?.status ?? "saved",
      notes: input.notes ?? snap.data()?.notes ?? "",
      takeaways: Array.isArray(input.takeaways) ? input.takeaways.filter(Boolean).slice(0, 8) : snap.data()?.takeaways ?? [],
      nextAction: input.nextAction ?? snap.data()?.nextAction ?? "",
      lastViewedAt: input.lastViewedAt ? Timestamp.fromDate(new Date(input.lastViewedAt)) : snap.data()?.lastViewedAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return docData(await ref.get());
}

export async function deleteYoutubeLearningItem(userId: string, videoId: string) {
  await userDoc(userId).collection("youtubeLearning").doc(videoId).delete();
  return true;
}

export async function deleteYoutubeLearningItemsForUser(userId: string) {
  const docs = await userDoc(userId).collection("youtubeLearning").listDocuments();
  await Promise.all(docs.map((doc) => doc.delete()));
  return docs.length;
}

export async function createProgressPhotoMetadata(userId: string, input: any) {
  const ref = userDoc(userId).collection("progressPhotos").doc();
  await ref.set({
    userId,
    cloudStoragePath: input.cloudStoragePath,
    isPublic: false,
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

export async function upsertFoodMicronutrientLog(userId: string, foodLogId: string, input: any) {
  const ref = userDoc(userId).collection("foodMicronutrients").doc(foodLogId);
  await ref.set(
    {
      userId,
      foodLogId,
      foodName: input.foodName ?? null,
      mealType: input.mealType ?? null,
      servingSize: input.servingSize ?? null,
      date: input.date ? Timestamp.fromDate(new Date(input.date)) : FieldValue.serverTimestamp(),
      micronutrients: input.micronutrients ?? {},
      source: input.source ?? "manual",
      confidence: input.confidence ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: input.createdAt ?? FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return docData(await ref.get());
}

export async function listFoodMicronutrientLogsForFoodLogs(userId: string, foodLogIds: string[]) {
  if (foodLogIds.length === 0) return {};
  const entries = await Promise.all(
    foodLogIds.map(async (foodLogId) => {
      const snap = await userDoc(userId).collection("foodMicronutrients").doc(foodLogId).get();
      return snap.exists ? [foodLogId, docData(snap)] : null;
    })
  );
  return Object.fromEntries(entries.filter(Boolean) as Array<[string, any]>);
}

export async function deleteFoodMicronutrientLog(userId: string, foodLogId: string) {
  await userDoc(userId).collection("foodMicronutrients").doc(foodLogId).delete();
  return 1;
}

export async function deleteFoodMicronutrientLogsForUser(userId: string) {
  const docs = await userDoc(userId).collection("foodMicronutrients").listDocuments();
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

export type AgentUndoActionInput = {
  actionType: string;
  label: string;
  targetType: string;
  targetId: string;
  payload?: any;
  expiresAt?: Date;
};

export async function createAgentUndoAction(userId: string, input: AgentUndoActionInput) {
  const ref = userDoc(userId).collection("agentUndoActions").doc();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
  await ref.set({
    userId,
    actionType: input.actionType,
    label: input.label,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.payload ?? null,
    status: "open",
    expiresAt: Timestamp.fromDate(expiresAt),
    usedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docData(await ref.get());
}

export async function getAgentUndoAction(userId: string, id: string) {
  const snap = await userDoc(userId).collection("agentUndoActions").doc(id).get();
  return snap.exists ? docData(snap) : null;
}

export async function markAgentUndoActionUsed(userId: string, id: string) {
  const ref = userDoc(userId).collection("agentUndoActions").doc(id);
  await ref.set(
    {
      status: "used",
      usedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return docData(await ref.get());
}
