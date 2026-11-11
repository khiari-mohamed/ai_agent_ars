const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';
const DEFAULT_TIMEOUT_MS = 30_000;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

let unauthorizedHandler: (() => void) | null = null;

/** Called when an authenticated request returns 401 (expired or revoked token). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface ParsedError {
  code: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Handles {code,message}, FastAPI {detail: string}, {detail: {code,message}} and 422 {detail: [{msg}]}. */
function parseErrorBody(body: unknown, status: number): ParsedError {
  const fallback: ParsedError = { code: 'UNKNOWN_ERROR', message: `HTTP ${status}` };
  if (!isRecord(body)) return fallback;
  const detail = body.detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (isRecord(item) ? asString(item.msg) : asString(item)))
      .filter((m): m is string => m !== undefined);
    return {
      code: asString(body.code) ?? 'VALIDATION_ERROR',
      message: messages.length > 0 ? messages.join(' ; ') : fallback.message,
    };
  }

  const nested = isRecord(detail) ? detail : undefined;
  return {
    code: asString(body.code) ?? asString(nested?.code) ?? fallback.code,
    message:
      asString(body.message) ?? asString(nested?.message) ?? asString(detail) ?? fallback.message,
  };
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const external = options.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : null,
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new ApiError(0, 'TIMEOUT', 'La requête a expiré. Veuillez réessayer.');
      if (external?.aborted) throw error; // caller cancelled: let AbortError through
      throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur.');
    }

    if (!response.ok) {
      let parsed: ParsedError = { code: 'UNKNOWN_ERROR', message: `HTTP ${response.status}` };
      try {
        parsed = parseErrorBody(await response.json(), response.status);
      } catch {
        // non-JSON error body: keep the HTTP status message
      }
      if (response.status === 401 && token) unauthorizedHandler?.();
      throw new ApiError(response.status, parsed.code, parsed.message);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Réponse du serveur invalide.');
    }
  } finally {
    window.clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

export const api = {
  get: <T>(path: string, token?: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, token, options),
  post: <T>(path: string, body: unknown, token?: string, options?: RequestOptions) =>
    request<T>('POST', path, body, token, options),
  put: <T>(path: string, body: unknown, token?: string, options?: RequestOptions) =>
    request<T>('PUT', path, body, token, options),
  patch: <T>(path: string, body: unknown, token?: string, options?: RequestOptions) =>
    request<T>('PATCH', path, body, token, options),
  delete: <T>(path: string, token?: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, token, options),
};