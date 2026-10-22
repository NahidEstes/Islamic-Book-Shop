import dotenv from "dotenv";
import { createApp } from "./app";
import { connectStore } from "./store";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const demo = process.env.DEMO_MODE !== "false";
  const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
  const store = await connectStore(process.env.MONGODB_URI, demo, production);
  const port = Number(process.env.PORT || 4000);
  if (production && (!process.env.PUBLIC_APP_URL || new URL(process.env.PUBLIC_APP_URL).protocol !== "https:" || !process.env.UPLOAD_DIR)) throw new Error("Set HTTPS PUBLIC_APP_URL and a durable UPLOAD_DIR for production.");
  const app = createApp(store, process.env.ADMIN_API_KEY, { production });
  const timer = setInterval(() => { void app.locals.flushOutbox().catch(() => console.error("Outbox processing failed; messages remain queued.")); }, 30000);
  timer.unref();
  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`Noor API: http://127.0.0.1:${port} (${store.demo ? "DEMO — no fulfillment" : "live COD"})`);
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { clearInterval(timer); server.close(() => process.exit(0)); });
}
main().catch((error) => { console.error(error.message); process.exit(1); });
