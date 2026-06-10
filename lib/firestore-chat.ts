import { randomUUID } from "crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteFile, getFileUrl } from "@/lib/s3";
import { getFirebaseAdminApp } from "@/lib/firebase-storage";

export type ChatRole = "user" | "assistant";

export type FirestoreChatSession = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessage?: string | null;
};

export type FirestoreChatAttachment = {
  id: string;
  userId: string;
  sessionId: string;
  messageId?: string | null;
  kind: string;
  mimeType?: string | null;
  cloudStoragePath?: string | null;
  expiresAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
};

export type FirestoreChatMessage = {
  id: string;
  userId: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
  attachments?: FirestoreChatAttachment[];
  undoActions?: any[];
};

function db() {
  const app = getFirebaseAdminApp();
  return getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "(default)");
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date();
}

function cleanUndefined<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
}

function sessionRef(userId: string, sessionId: string) {
  return db().collection("users").doc(userId).collection("chatSessions").doc(sessionId);
}

function sessionsRef(userId: string) {
  return db().collection("users").doc(userId).collection("chatSessions");
}

function messagesRef(userId: string, sessionId: string) {
  return sessionRef(userId, sessionId).collection("messages");
}

function attachmentsRef(userId: string, sessionId: string) {
  return sessionRef(userId, sessionId).collection("attachments");
}

function sessionFromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreChatSession {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    userId: String(data.userId ?? ""),
    title: String(data.title ?? "New chat"),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    messageCount: Number(data.messageCount ?? 0),
    lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : null,
  };
}

function attachmentFromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreChatAttachment {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    userId: String(data.userId ?? ""),
    sessionId: String(data.sessionId ?? ""),
    messageId: typeof data.messageId === "string" ? data.messageId : null,
    kind: String(data.kind ?? "image"),
    mimeType: typeof data.mimeType === "string" ? data.mimeType : null,
    cloudStoragePath: typeof data.cloudStoragePath === "string" ? data.cloudStoragePath : null,
    expiresAt: data.expiresAt ? toDate(data.expiresAt) : null,
    deletedAt: data.deletedAt ? toDate(data.deletedAt) : null,
    createdAt: toDate(data.createdAt),
  };
}

function messageFromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreChatMessage {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    userId: String(data.userId ?? ""),
    sessionId: String(data.sessionId ?? ""),
    role: data.role === "assistant" ? "assistant" : "user",
    content: String(data.content ?? ""),
    createdAt: toDate(data.createdAt),
    undoActions: Array.isArray(data.undoActions) ? data.undoActions : [],
  };
}

export async function getOrCreateFirestoreChatSession(userId: string, sessionId?: string | null, titleSeed?: string) {
  if (sessionId) {
    const existing = await sessionRef(userId, sessionId).get();
    if (existing.exists) return sessionFromDoc(existing);
  }

  return createFirestoreChatSession(userId, titleSeed);
}

export async function createFirestoreChatSession(userId: string, titleSeed?: string | null) {
  const title = titleSeed?.trim()
    ? titleSeed.trim().replace(/\s+/g, " ").slice(0, 48)
    : "New chat";
  const ref = sessionsRef(userId).doc();
  const now = Timestamp.now();
  await ref.set({
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    lastMessage: null,
  });
  return sessionFromDoc(await ref.get());
}

export async function addFirestoreChatMessage(input: {
  userId: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  undoActions?: any[];
}) {
  const ref = messagesRef(input.userId, input.sessionId).doc();
  const now = Timestamp.now();
  await ref.set({
    userId: input.userId,
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    undoActions: input.undoActions ?? [],
    createdAt: now,
  });
  await sessionRef(input.userId, input.sessionId).set(
    {
      updatedAt: now,
      lastMessage: input.content.replace(/\s+/g, " ").slice(0, 180),
      messageCount: FieldValue.increment(1),
    },
    { merge: true }
  );
  return messageFromDoc(await ref.get());
}

export async function addFirestoreChatAttachment(input: {
  userId: string;
  sessionId: string;
  messageId?: string | null;
  kind?: string;
  mimeType?: string | null;
  cloudStoragePath?: string | null;
  expiresAt?: Date | null;
}) {
  const id = randomUUID();
  const ref = attachmentsRef(input.userId, input.sessionId).doc(id);
  await ref.set(
    cleanUndefined({
      userId: input.userId,
      sessionId: input.sessionId,
      messageId: input.messageId ?? null,
      kind: input.kind ?? "image",
      mimeType: input.mimeType ?? null,
      cloudStoragePath: input.cloudStoragePath ?? null,
      expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
      deletedAt: null,
      createdAt: Timestamp.now(),
    })
  );
  return attachmentFromDoc(await ref.get());
}

export async function listFirestoreChatMessages(userId: string, sessionId: string, limit: number) {
  const snapshot = await messagesRef(userId, sessionId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const messages = snapshot.docs.map(messageFromDoc).reverse();

  const attachmentSnapshot = await attachmentsRef(userId, sessionId).get();
  const attachmentsByMessage = new Map<string, FirestoreChatAttachment[]>();
  attachmentSnapshot.docs.map(attachmentFromDoc).forEach((attachment) => {
    if (!attachment.messageId) return;
    attachmentsByMessage.set(attachment.messageId, [...(attachmentsByMessage.get(attachment.messageId) ?? []), attachment]);
  });

  return messages.map((message) => ({
    ...message,
    attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => attachmentMetadataForClient(attachment)),
  }));
}

export async function listFirestoreChatSessions(userId: string, offset: number, limit: number) {
  const snapshot = await sessionsRef(userId)
    .orderBy("updatedAt", "desc")
    .offset(offset)
    .limit(limit + 1)
    .get();
  return snapshot.docs.map(sessionFromDoc);
}

export async function listRecentAssistantChatMessages(userId: string, since: Date, limit: number) {
  const sessions = await listFirestoreChatSessions(userId, 0, 7);
  const results: FirestoreChatMessage[] = [];
  for (const session of sessions) {
    const snapshot = await messagesRef(userId, session.id)
      .orderBy("createdAt", "desc")
      .limit(Math.max(limit * 3, 20))
      .get();
    results.push(
      ...snapshot.docs
        .map(messageFromDoc)
        .filter((message) => message.role === "assistant" && message.createdAt >= since)
    );
  }
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

export async function renderFirestoreChatAttachment(attachment: FirestoreChatAttachment) {
  const now = new Date();
  const expired = attachment.expiresAt && attachment.expiresAt <= now;
  if (attachment.deletedAt || expired) {
    return {
      ...attachment,
      url: null,
      deleted: true,
      deletedReason: "Image expired",
    };
  }

  return {
    ...attachment,
    url: attachment.cloudStoragePath ? await getFileUrl(attachment.cloudStoragePath, false).catch(() => null) : null,
    deleted: false,
    deletedReason: null,
  };
}

export function attachmentMetadataForClient(attachment: FirestoreChatAttachment) {
  const now = new Date();
  const expired = attachment.expiresAt && attachment.expiresAt <= now;
  return {
    id: attachment.id,
    userId: attachment.userId,
    sessionId: attachment.sessionId,
    messageId: attachment.messageId,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    expiresAt: attachment.expiresAt,
    deletedAt: attachment.deletedAt,
    createdAt: attachment.createdAt,
    deleted: Boolean(attachment.deletedAt || expired),
    deletedReason: attachment.deletedAt || expired ? "Image expired" : null,
    hasImage: Boolean(attachment.cloudStoragePath && !attachment.deletedAt && !expired),
  };
}

export async function getFirestoreChatAttachment(userId: string, sessionId: string, attachmentId: string) {
  const doc = await attachmentsRef(userId, sessionId).doc(attachmentId).get();
  if (!doc.exists) return null;
  const attachment = attachmentFromDoc(doc);
  if (attachment.userId !== userId || attachment.sessionId !== sessionId) return null;
  return attachment;
}

export async function deleteFirestoreChatSession(userId: string, sessionId: string) {
  const session = await sessionRef(userId, sessionId).get();
  if (!session.exists) return false;
  const attachmentSnapshot = await attachmentsRef(userId, sessionId).get();
  for (const doc of attachmentSnapshot.docs) {
    const attachment = attachmentFromDoc(doc);
    if (attachment.cloudStoragePath && attachment.kind !== "telegram_photo") {
      await deleteFile(attachment.cloudStoragePath).catch((error) => {
        console.error("Failed to delete chat attachment", attachment.cloudStoragePath, error);
      });
    }
  }

  const messageSnapshot = await messagesRef(userId, sessionId).get();
  const batch = db().batch();
  messageSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  attachmentSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(session.ref);
  await batch.commit();
  return true;
}

export async function deleteAllFirestoreChatData(userId: string) {
  const snapshot = await sessionsRef(userId).get();
  let sessions = 0;
  for (const doc of snapshot.docs) {
    const deleted = await deleteFirestoreChatSession(userId, doc.id);
    if (deleted) sessions += 1;
  }
  return { chatSessions: sessions };
}

export async function pruneFirestoreChatRetention(userId: string, sessionLimit: number, messageLimit: number) {
  const sessions = await listFirestoreChatSessions(userId, 0, 100);
  const oldSessions = sessions.slice(sessionLimit);
  for (const session of oldSessions) {
    await deleteFirestoreChatSession(userId, session.id);
  }

  let deletedMessages = 0;
  let expiredImages = 0;
  for (const session of sessions.slice(0, sessionLimit)) {
    const messageSnapshot = await messagesRef(userId, session.id).orderBy("createdAt", "desc").offset(messageLimit).get();
    const oldMessageIds = new Set(messageSnapshot.docs.map((doc) => doc.id));
    if (oldMessageIds.size) {
      const attachmentSnapshot = await attachmentsRef(userId, session.id).get();
      const batch = db().batch();
      attachmentSnapshot.docs.forEach((doc) => {
        const attachment = attachmentFromDoc(doc);
        if (attachment.messageId && oldMessageIds.has(attachment.messageId)) batch.delete(doc.ref);
      });
      messageSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deletedMessages += oldMessageIds.size;
    }

    const now = new Date();
    const attachmentSnapshot = await attachmentsRef(userId, session.id).where("deletedAt", "==", null).get();
    for (const doc of attachmentSnapshot.docs) {
      const attachment = attachmentFromDoc(doc);
      if (!attachment.expiresAt || attachment.expiresAt > now) continue;
      if (attachment.cloudStoragePath && attachment.kind !== "telegram_photo") {
        await deleteFile(attachment.cloudStoragePath).catch(() => null);
      }
      await doc.ref.set({ cloudStoragePath: null, deletedAt: Timestamp.now() }, { merge: true });
      expiredImages += 1;
    }
  }

  return { deletedMessages, expiredImages };
}
