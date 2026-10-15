"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { WRITE_FENCE_PATH, writesOpen } from "@/lib/safety/writeFence.mjs";
export default function MaintenanceBanner() {
  const [paused, setPaused] = useState(false);
  useEffect(() => onSnapshot(doc(db, WRITE_FENCE_PATH), snapshot => setPaused(!writesOpen(snapshot.data())), () => setPaused(true)), []);
  if (!paused) return null;
  return <aside role="status" className="bg-black text-white border-b border-blue-500 px-4 py-4 text-center text-sm">Studio updates are temporarily paused. You can still sign in and read your approved portal history. Please keep your submission open and retry when updates resume. Your account and saved records are safe.</aside>;
}
