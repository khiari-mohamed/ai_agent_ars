import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';

const fetchMock = vi.fn();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api', () => {
  it('sends auth and JSON body, returns parsed data', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const result = await api.post<{ ok: boolean }>('/x', { a: 1 }, 'tok');
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/x')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  });

  it('does not send Content-Type on GET', async () => {
    fetchMock.mockResolvedValue(json({}));
    await api.get('/x');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('returns undefined on 204 and on empty bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await api.delete('/x')).toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await api.get('/x')).toBeUndefined();
  });

  it('parses {detail: string}', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Not found' }, 404));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 404, code: 'UNKNOWN_ERROR', message: 'Not found' });
  });

  it('parses {detail: {code, message}}', async () => {
    fetchMock.mockResolvedValue(json({ detail: { code: 'TOKEN_EXPIRED', message: 'Session expirée' } }, 401));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED', message: 'Session expirée' });
  });

  it('parses FastAPI 422 arrays', async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ msg: 'Field required' }, { msg: 'Invalid email' }] }, 422));
    await expect(api.post('/x', {})).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Field required ; Invalid email',
    });
  });

  it('falls back to the HTTP status on non-JSON errors', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, message: 'HTTP 502' });
  });

  it('wraps network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api.get('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('rejects invalid JSON on success', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('times out', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const assertion = expect(api.get('/slow', undefined, { timeoutMs: 1000 })).rejects.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('lets caller aborts through as AbortError', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = api.get('/x', undefined, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
