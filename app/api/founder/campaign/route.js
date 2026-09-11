import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { configuredFounderEnvironment, readCampaignStats } from "@/lib/server/founderViewsService";
import { FOUNDER_GOAL_CENTS } from "@/lib/payments/founderViews";
export async function GET() { try { const { firestore } = getFirebaseAdmin(); return NextResponse.json(await readCampaignStats(firestore, configuredFounderEnvironment()), { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }); } catch { return NextResponse.json({ goalAmountCents: FOUNDER_GOAL_CENTS, eligibleAmountCents: 0, supporterCount: 0, percentage: 0, unavailable: true }, { headers: { "Cache-Control": "no-store" } }); } }
