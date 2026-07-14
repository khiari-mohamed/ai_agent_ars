const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

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

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : null,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json() as { code?: string; message?: string };
      code = err.code ?? code;
      message = err.message ?? message;
    } catch { /* ignore parse error */ }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string, token?: string) => request<T>('GET',    path, undefined, token),
  post:   <T>(path: string, body: unknown, token?: string) => request<T>('POST',   path, body, token),
  put:    <T>(path: string, body: unknown, token?: string) => request<T>('PUT',    path, body, token),
  patch:  <T>(path: string, body: unknown, token?: string) => request<T>('PATCH',  path, body, token),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, undefined, token),
};