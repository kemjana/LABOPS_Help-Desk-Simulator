// Maps the server-style variable names to the public names the browser needs.
// The build REFUSES to start if a secret key ends up in a public variable.
const url = (process.env.SUPABASE_URL || '').trim();
const pub = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

function isSecretKey(v) {
  if (!v) return false;
  if (v.startsWith('sb_secret_')) return true;
  if (v.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString('utf8'));
      return payload.role === 'service_role';
    } catch { return false; }
  }
  return false;
}

if (isSecretKey(pub)) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY contains a SECRET key (sb_secret_... or service_role). Use the PUBLISHABLE key (sb_publishable_...) there, and put the secret key in SUPABASE_SECRET_KEY.');
}
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('NEXT_PUBLIC_') && isSecretKey(String(v || ''))) {
    throw new Error(`${k} contains a secret key. Public variables are sent to the browser. Remove it.`);
  }
  if (k.startsWith('NEXT_PUBLIC_') && /GEMINI|SECRET/i.test(k)) {
    throw new Error(`${k} must not be a public variable. Never expose Gemini or secret keys to the browser.`);
  }
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) {
  throw new Error(`SUPABASE_URL must look exactly like https://PROJECT-ID.supabase.co (no /rest/v1, no trailing slash). You have: ${url}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pub,
  },
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default nextConfig;
