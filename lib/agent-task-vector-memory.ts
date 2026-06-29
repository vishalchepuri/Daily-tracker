type AgentTaskMemoryInput = {
  userId: string;
  taskId: string;
  taskName: string;
  prompt: string;
  url?: string | null;
  runId: string;
  summary: string;
};

type AgentTaskMemoryQuery = {
  userId: string;
  taskId?: string;
  prompt: string;
  url?: string | null;
};

const DEFAULT_DIMENSION = 384;
const DEFAULT_NAMESPACE = "dayza-agent-tasks";

function pineconeApiKey() {
  return process.env.PINECONE_API_KEY?.trim() ?? "";
}

function pineconeHost() {
  return (process.env.PINECONE_INDEX_HOST?.trim() ?? "").replace(/\/$/, "");
}

function pineconeNamespace() {
  return process.env.PINECONE_NAMESPACE?.trim() || DEFAULT_NAMESPACE;
}

function vectorDimension() {
  const value = Number(process.env.PINECONE_VECTOR_DIM ?? DEFAULT_DIMENSION);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_DIMENSION;
}

export function isAgentTaskVectorMemoryConfigured() {
  return Boolean(pineconeApiKey() && pineconeHost());
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(text: string) {
  const dimension = vectorDimension();
  const vector = Array.from({ length: dimension }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9$%._/-]+/g) ?? [];

  for (const token of tokens.slice(0, 1200)) {
    const hash = hashToken(token);
    const index = hash % dimension;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign * Math.min(3, Math.log(token.length + 1));
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function chunksForMemory(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  for (let start = 0; start < normalized.length && chunks.length < 5; start += 1200) {
    chunks.push(normalized.slice(start, start + 1400).trim());
  }
  return chunks.filter(Boolean);
}

async function pineconePost(path: string, body: unknown) {
  if (!isAgentTaskVectorMemoryConfigured()) return null;

  const res = await fetch(`${pineconeHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": pineconeApiKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function queryAgentTaskMemory(input: AgentTaskMemoryQuery) {
  if (!isAgentTaskVectorMemoryConfigured()) return "";

  const queryText = [
    `Instruction: ${input.prompt}`,
    input.url ? `URL: ${input.url}` : "",
  ].filter(Boolean).join("\n");

  const taskFilter = input.taskId
    ? { userId: { $eq: input.userId }, taskId: { $eq: input.taskId } }
    : { userId: { $eq: input.userId } };

  const data: any = await pineconePost("/query", {
    namespace: pineconeNamespace(),
    vector: embedText(queryText),
    topK: 5,
    includeMetadata: true,
    filter: taskFilter,
  }).catch(() => null);

  const matches = Array.isArray(data?.matches) ? data.matches : [];
  const snippets = matches
    .filter((match: any) => Number(match?.score ?? 0) > 0.05 && match?.metadata?.text)
    .map((match: any, index: number) => {
      const score = Math.round(Number(match.score ?? 0) * 100) / 100;
      return `Past run ${index + 1} (score ${score}): ${String(match.metadata.text).slice(0, 1800)}`;
    });

  return snippets.join("\n\n").slice(0, 5000);
}

export async function rememberAgentTaskRun(input: AgentTaskMemoryInput) {
  if (!isAgentTaskVectorMemoryConfigured()) return;

  const text = [
    `Task: ${input.taskName}`,
    `Instruction: ${input.prompt}`,
    input.url ? `URL: ${input.url}` : "",
    `Result:\n${input.summary}`,
  ].filter(Boolean).join("\n");
  const chunks = chunksForMemory(text);
  if (!chunks.length) return;

  const createdAt = new Date().toISOString();
  await pineconePost("/vectors/upsert", {
    namespace: pineconeNamespace(),
    vectors: chunks.map((chunk, index) => ({
      id: `agent-task-${input.runId}-${index}`,
      values: embedText(chunk),
      metadata: {
        userId: input.userId,
        taskId: input.taskId,
        runId: input.runId,
        taskName: input.taskName,
        url: input.url ?? "",
        createdAt,
        text: chunk.slice(0, 2000),
      },
    })),
  }).catch(() => null);
}
