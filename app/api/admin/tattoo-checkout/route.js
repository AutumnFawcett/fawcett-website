import { handleTattooSquareSandbox } from "@/lib/payments/tattooSandboxCheckout.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sandbox Preview only. Production always returns disabled, including if someone
// accidentally sets sandbox credentials in Vercel Production.
export async function GET(request) {
  return handleTattooSquareSandbox(request);
}

export async function POST(request) {
  return handleTattooSquareSandbox(request);
}
