export type ServiceResult<T> = {
  data: T;
  ok: boolean;
  error?: string;
};

export async function safeService<T>(fallback: T, loader: () => Promise<T>): Promise<ServiceResult<T>> {
  try {
    return { data: await loader(), ok: true };
  } catch (error: any) {
    console.error("Service failed", error);
    return { data: fallback, ok: false, error: error?.message ?? "Service failed" };
  }
}

