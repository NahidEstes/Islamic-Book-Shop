import { deploymentDemoEnabled } from "@/lib/runtime-mode";
import { demoResponse } from "@/lib/deployment-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!deploymentDemoEnabled(process.env)) return Response.json({ error: "API সংযোগ কনফিগার করা হয়নি।" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return demoResponse(request, (await context.params).path);
}
export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
