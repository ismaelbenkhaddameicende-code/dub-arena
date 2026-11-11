// En web se usa el proxy de Vite (rutas relativas). En el APK hay que apuntar
// al servidor de la red local: VITE_API_URL=http://192.168.1.50:4000
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const BASE = API_BASE;

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

let authToken: string | null = localStorage.getItem('dub-arena-token');

export const setToken = (token: string | null): void => {
  authToken = token;
  if (token) localStorage.setItem('dub-arena-token', token);
  else localStorage.removeItem('dub-arena-token');
};

export const getToken = (): string | null => authToken;

async function parseError(res: Response): Promise<ApiError> {
  let message = `Error ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json() as { error?: string; details?: string[]; code?: string };
    if (body.error) message = body.error;
    if (body.details?.length) message = `${message}: ${body.details.join(', ')}`;
    code = body.code;
  } catch { /* respuesta sin JSON */ }
  return new ApiError(message, res.status, code);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** URL con token firmado para <video>, <audio> o fetch de audio. */
export async function signedUrl(resourceId: string, kind: 'media' | 'recording'): Promise<string> {
  const { token } = await api.get<{ token: string }>(`/api/media/${resourceId}/token?kind=${kind}`);
  const path = kind === 'media' ? `/api/media/${resourceId}/stream` : `/api/recordings/${resourceId}/stream`;
  return `${BASE}${path}?token=${token}`;
}

export function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${BASE}${url}`;
}
