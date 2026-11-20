async function networkRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" }); }
  catch { throw new Error("সার্ভারের সঙ্গে সংযোগ হচ্ছে না। আবার চেষ্টা করুন।"); }
  const data = await response.json().catch(() => ({ error: "সার্ভারের উত্তর পাওয়া যায়নি। API চালু আছে কি না দেখুন।" }));
  if (!response.ok) throw new Error(data.error || "অনুরোধটি সম্পন্ন হয়নি");
  return data as T;
}
type Configuration = { demo?: boolean; readOnly?: boolean; browserCatalog?: boolean };
let configuration: Promise<Configuration> | undefined;
function clientConfiguration() {
  configuration ??= networkRequest<Configuration>("/config").catch((error) => { configuration = undefined; throw error; });
  return configuration;
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (typeof window === "undefined") return networkRequest<T>(path, options);
  if (path === "/config") return await clientConfiguration() as T;
  const config = await clientConfiguration();
  if (config.demo && config.readOnly && config.browserCatalog) {
    const { browserDemoRequest } = await import("./browser-demo");
    const result = await browserDemoRequest(path, options);
    if (result.handled) return result.value as T;
  }
  return networkRequest<T>(path, options);
}
