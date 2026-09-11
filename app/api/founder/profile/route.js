import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { configuredFounderEnvironment, readFounderProfile, updateFounderRecognition } from "@/lib/server/founderViewsService";
const headers = { "Cache-Control": "no-store" };
async function context(request) { const { auth, firestore } = getFirebaseAdmin(); return { firestore, uid: await verifyFirebaseBearer(request, auth.verifyIdToken.bind(auth)), environment: configuredFounderEnvironment() }; }
export async function GET(request) { try { const value = await context(request); return NextResponse.json({ profile: await readFounderProfile(value.firestore, value.uid, value.environment) }, { headers }); } catch { return NextResponse.json({ error: "Unable to load Founder profile." }, { status: 401, headers }); } }
export async function PATCH(request) { try { const value = await context(request); const profile = await updateFounderRecognition(value.firestore, value.uid, value.environment, await request.json()); return NextResponse.json({ profile }, { headers }); } catch { return NextResponse.json({ error: "Unable to update recognition preference." }, { status: 400, headers }); } }
