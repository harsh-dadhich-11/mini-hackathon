// Browser-side JSON calls that always settle: a timeout, a dropped connection or a non-JSON error page
// all come back as `{ ok: false, error }`, so no button is ever left stuck on "Saving…".

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

const TIMEOUT_MS = 10_000;

const STATUS_MESSAGES: Record<number, string> = {
  401: "Your session has ended. Sign in again.",
  429: "Too many attempts. Wait a moment and try again.",
};

/** Aborts after `ms`, or when `outer` aborts. Built by hand because AbortSignal.any is missing on older phones. */
function deadline(ms: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const relay = () => controller.abort();
  outer?.addEventListener("abort", relay, { once: true });
  return { signal: controller.signal, done: () => { clearTimeout(timer); outer?.removeEventListener("abort", relay); } };
}

export async function requestJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<ApiResult<T>> {
  const { timeoutMs = TIMEOUT_MS, signal: outer, ...rest } = init;
  const { signal, done } = deadline(timeoutMs, outer ?? undefined);
  try {
    const response = await fetch(url, { cache: "no-store", ...rest, signal });
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) return { ok: false, status: response.status, error: body.error ?? STATUS_MESSAGES[response.status] ?? "Something went wrong. Try again." };
    return { ok: true, status: response.status, data: body };
  } catch {
    return {
      ok: false,
      status: 0,
      error: signal.aborted && !outer?.aborted ? "The server took too long to answer. Check your connection and try again." : "No connection. Check your Wi-Fi and try again.",
    };
  } finally {
    done();
  }
}

export function postJson<T>(url: string, body?: unknown, init: RequestInit & { timeoutMs?: number } = {}) {
  return requestJson<T>(url, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
