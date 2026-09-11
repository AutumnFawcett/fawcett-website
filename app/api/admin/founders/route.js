import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/server/firebaseAdmin";
import { verifyFirebaseBearer } from "@/lib/server/firebaseBearerAuth";
import { configuredFounderEnvironment, listFounders } from "@/lib/server/founderViewsService";
export async function GET(request) { const headers = { "Cache-Control": "no-store" }; try { const { auth, firestore } = getFirebaseAdmin(); const uid = await verifyFirebaseBearer(request, auth.verifyIdToken.bind(auth)); const admin = await firestore.collection("adminUsers").doc(uid).get(); if (!admin.exists || admin.data().active !== true) throw new Error("denied"); return NextResponse.json({ founders: await listFounders(firestore, configuredFounderEnvironment()) }, { headers }); } catch { return NextResponse.json({ error: "Access denied." }, { status: 403, headers }); } }
