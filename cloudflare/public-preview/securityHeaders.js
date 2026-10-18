const source = 'https://chms1chineselanguageclubsystem.vercel.app'

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    `script-src 'self' ${source} https://www.gstatic.com`,
    `style-src 'self' 'unsafe-inline' ${source} https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    `connect-src 'self' ${source} https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com`,
    "worker-src 'self' blob:",
    'frame-src https://*.firebaseapp.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
}
