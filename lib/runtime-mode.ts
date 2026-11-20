type Environment = Record<string, string | undefined>;
export function deploymentDemoEnabled(env: Environment) {
  // Live mode must never silently turn into a sample catalog.
  if (env.DEMO_MODE === "false" || env.VERCEL_DEMO_MODE === "false") return false;
  if (env.VERCEL_DEMO_MODE === "true") return true;
  if (env.VERCEL !== "1" || env.MONGODB_URI) return false;
  if (!env.API_INTERNAL_URL) return true;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.API_INTERNAL_URL).hostname); }
  catch { return false; }
}
