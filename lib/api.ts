export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" }); }
  catch { throw new Error("সার্ভারের সঙ্গে সংযোগ হচ্ছে না। আবার চেষ্টা করুন।"); }
  const data = await response.json().catch(() => ({ error: "সার্ভারের উত্তর পাওয়া যায়নি। API চালু আছে কি না দেখুন।" }));
  if (!response.ok) throw new Error(data.error || "অনুরোধটি সম্পন্ন হয়নি");
  return data as T;
}
