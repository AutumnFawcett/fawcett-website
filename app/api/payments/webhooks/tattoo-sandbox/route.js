import { handleTattooSandboxWebhook } from "@/lib/payments/tattooSandboxWebhookHandler.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  return handleTattooSandboxWebhook(request);
}
