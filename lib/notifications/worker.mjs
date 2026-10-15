import { fencedFirestore } from "../safety/serverFence.mjs";
import { timingSafeEqual } from "node:crypto";
import { notificationConfig } from "./config.mjs";
import { discoverNotifications, processNotifications, generation } from "./queue.mjs";
import { notificationTransport } from "./transport.mjs";
export function authorizedWorker(request, secret) {
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret || ""}`;
  return typeof secret === "string" && secret.length >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export async function approveConfigurationGeneration(firestore, config, now = Date.now()) {
  firestore = fencedFirestore(firestore);
  const ref = firestore.doc("notificationConfiguration/current");
  await firestore.runTransaction(async tx => {
    const previous = (await tx.get(ref)).data();
    const identity = generation(config);
    if (previous && previous.generation !== identity && config.since <= previous.lastTickAt) throw new Error("new_activation_watermark_required");
    tx.set(ref, { generation: identity, lastTickAt: Math.max(now, previous?.lastTickAt || 0) });
  });
}
export async function runNotifications(firestore, auth, env = process.env) {
  const config = notificationConfig(env);
  if (config.mode === "off") return { disabled: true };
  await approveConfigurationGeneration(firestore, config);
  return { ...await discoverNotifications(firestore, config, { limit: 25 }), ...await processNotifications(firestore, auth, config, notificationTransport(config)) };
}
