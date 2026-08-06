import { next } from '@vercel/functions';

declare const process: { env: Record<string, string | undefined> };

// Staff-only gate for the whole POS link. Not per-user auth — one shared
// code, checked here, unlocks a cookie for ~30 days. Rotate STAFF_ACCESS_CODE
// in Vercel env vars to revoke access for everyone at once (no per-person
// revoke). Real login/roles still happen inside the app after this.
const COOKIE_NAME = 'nb_staff_gate';
const VERIFY_PATH = '/__staff-gate/verify';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function gatePage(nextPath: string, error?: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NomadBite Staff Access</title>
<style>
  body { font-family: system-ui, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  form { background: #1c1c1c; padding: 2rem; border-radius: 8px; width: 280px; }
  h1 { font-size: 1.05rem; margin: 0 0 1rem; }
  input { width: 100%; padding: .6rem; margin-top: .25rem; margin-bottom: 1rem; border-radius: 4px; border: 1px solid #444; background: #000; color: #fff; box-sizing: border-box; font-size: 1rem; }
  button { width: 100%; padding: .6rem; border-radius: 4px; border: none; background: #DC2626; color: #fff; font-weight: 600; cursor: pointer; font-size: 1rem; }
  .err { color: #f87171; font-size: .85rem; margin-bottom: 1rem; }
</style>
</head>
<body>
  <form method="POST" action="${VERIFY_PATH}">
    <h1>NomadBite Staff Access</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    <input type="hidden" name="next" value="${nextPath.replace(/"/g, '&quot;')}" />
    <input type="password" name="code" placeholder="Staff access code" autofocus required />
    <button type="submit">Enter</button>
  </form>
</body>
</html>`;
}

function gateResponse(nextPath: string, error?: string): Response {
  return new Response(gatePage(nextPath, error), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length, 1);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const accessCode = process.env.STAFF_ACCESS_CODE;
  const sessionToken = process.env.STAFF_ACCESS_TOKEN;

  if (!accessCode || !sessionToken) {
    // Misconfigured — fail closed rather than silently letting everyone through.
    return new Response('Staff access gate is not configured.', { status: 500 });
  }

  if (url.pathname === VERIFY_PATH && request.method === 'POST') {
    const form = await request.formData();
    const submitted = form.get('code');
    const redirectTo = String(form.get('next') || '/');

    if (typeof submitted === 'string' && timingSafeEqual(submitted, accessCode)) {
      const headers = new Headers({ Location: redirectTo });
      headers.append(
        'Set-Cookie',
        `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
      );
      return new Response(null, { status: 303, headers });
    }
    return gateResponse(redirectTo, 'Incorrect code — try again.');
  }

  const cookieValue = getCookie(request, COOKIE_NAME);
  if (!cookieValue || !timingSafeEqual(cookieValue, sessionToken)) {
    return gateResponse(url.pathname + url.search);
  }

  return next();
}

export const config = {
  runtime: 'edge',
  matcher: '/(.*)',
};
