export async function safeJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch (error) {
    console.error(`Request failed: ${url}`, error);
    return fallback;
  }
}

