import { next } from '@vercel/functions';

// Password gate for the whole site, including data.json.
// Stores only the SHA-256 hash of the password. Username is ignored.
const PASSWORD_SHA256 = 'fe41220b482eefcaf074a9cbb20d97444bef96550cf5895ec94821596bd1c18c';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(request) {
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if ((await sha256(password)) === PASSWORD_SHA256) return next();
    } catch (e) { /* fall through to 401 */ }
  }
  return new Response('Password required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Ambient Scribe report", charset="UTF-8"',
      'Cache-Control': 'no-store'
    }
  });
}
