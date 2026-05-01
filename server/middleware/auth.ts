// Basic Auth gate. Blocks every request unless it has a valid Authorization header.
// Set the password via: npx wrangler secret put APP_PASSWORD
//
// To bypass for a specific path, add it to PUBLIC_PATHS below.

const PUBLIC_PATHS = [
  "/api/health", // healthcheck — keep open for monitoring
];

export default defineEventHandler((event) => {
  const env = event.context.cloudflare?.env as any;
  const expectedPassword = env?.APP_PASSWORD;

  // If no password is set, leave the app open (dev mode)
  if (!expectedPassword) return;

  const url = getRequestURL(event);
  if (PUBLIC_PATHS.some((p) => url.pathname.startsWith(p))) return;

  const authHeader = getRequestHeader(event, "authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const [, password] = decoded.split(":");
      if (password === expectedPassword) return; // OK
    } catch {
      // fall through to 401
    }
  }

  setResponseStatus(event, 401);
  setResponseHeader(event, "WWW-Authenticate", 'Basic realm="Baseera", charset="UTF-8"');
  setResponseHeader(event, "Content-Type", "text/plain");
  return "Authentication required";
});
