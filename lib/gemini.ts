type OpenAiContentPart =
  | { type: "text"; text?: string }
  | { type: "image_url"; image_url?: { url?: string } };

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type GeminiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAiContentPart[];
};

type GeminiTextOptions = {
  messages: GeminiChatMessage[];
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  models?: string[];
};

const DEFAULT_GEMINI_MODELS = [
  process.env.DAYZA_GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter(Boolean) as string[];

function apiKey() {
  return process.env.GEMINI_API_KEY?.trim();
}

function dataUrlToInlineData(url: string) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function textPart(text: unknown) {
  const value = String(text ?? "").trim();
  return value ? { text: value } : null;
}

function openAiContentToGeminiParts(content: GeminiChatMessage["content"]): GeminiPart[] {
  if (typeof content === "string") {
    const part = textPart(content);
    return part ? [part] : [];
  }

  const parts: GeminiPart[] = [];
  for (const part of content) {
    if (part?.type === "text") {
      const next = textPart(part.text);
      if (next) parts.push(next);
      continue;
    }
    if (part?.type === "image_url") {
      const inlineData = dataUrlToInlineData(String(part.image_url?.url ?? ""));
      if (inlineData) parts.push({ inlineData });
    }
  }
  return parts;
}

function buildContents(messages: GeminiChatMessage[]) {
  const contents: any[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const parts = openAiContentToGeminiParts(message.content);
    if (parts.length === 0) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts,
    });
  }
  return contents;
}

function buildSystemInstruction(system: string | undefined, messages: GeminiChatMessage[]) {
  const systemMessages = [
    system,
    ...messages.filter((message) => message.role === "system").map((message) => message.content),
  ]
    .map((content) => {
      if (!content) return "";
      return typeof content === "string" ? content.trim() : openAiContentToGeminiParts(content).map((part: any) => part.text).filter(Boolean).join("\n");
    })
    .filter(Boolean);

  return systemMessages.length > 0 ? { parts: [{ text: systemMessages.join("\n\n") }] } : undefined;
}

function extractGeminiText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part) => part?.text ?? "").filter(Boolean).join("").trim();
  }
  return "";
}

function errorMessageFromGemini(data: any, fallback: string) {
  return String(data?.error?.message || data?.error || fallback);
}

export async function generateGeminiText(options: GeminiTextOptions) {
  const key = apiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");

  const models = (options.models?.length ? options.models : DEFAULT_GEMINI_MODELS).filter(Boolean);
  if (models.length === 0) throw new Error("No Gemini model is configured.");

  const contents = buildContents(options.messages);
  if (contents.length === 0) throw new Error("No Gemini content to send.");

  const body = {
    systemInstruction: buildSystemInstruction(options.system, options.messages),
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.25,
      maxOutputTokens: options.maxOutputTokens ?? 1200,
      candidateCount: 1,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  let lastError = "";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = extractGeminiText(data);
      if (text) return text;
      lastError = "Gemini returned an empty response.";
      continue;
    }
    lastError = errorMessageFromGemini(data, `Gemini request failed for ${model}.`);
    if (!/not found|not supported|unsupported|invalid/i.test(lastError)) break;
  }

  throw new Error(lastError || "Gemini request failed.");
}
