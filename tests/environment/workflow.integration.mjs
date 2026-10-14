import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { seedEmulators } from "../../scripts/seed-emulators.mjs";
import { firebaseEnvironment } from "../../lib/firebaseEnvironment.mjs";

test("synthetic Auth, admin access and owned records work using the checked-in rules", async () => {
  const first = await seedEmulators();
  assert.deepEqual(await seedEmulators(), first);
  const app = initializeApp(firebaseEnvironment().config, "integration-client");
  const auth = getAuth(app), db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  try {
    await signInWithEmailAndPassword(auth, "client@example.test", "Synthetic-only-123!");
    for (const path of ["clients/synthetic-client", "consultRequests/synthetic-consult", "membershipApplications/synthetic-application", "messages/synthetic-message"]) {
      assert.equal((await getDoc(doc(db, path))).exists(), true);
    }
    await assert.rejects(setDoc(doc(db, "clients/other-client"), { clientUid: "other-client" }), { code: "permission-denied" });
    await signOut(auth);
    await assert.rejects(getDoc(doc(db, "clients/synthetic-client")), { code: "permission-denied" });
    await signInWithEmailAndPassword(auth, "admin@example.test", "Synthetic-only-123!");
    assert.equal((await getDoc(doc(db, "adminUsers/synthetic-admin"))).data().active, true);
    assert.equal((await getDoc(doc(db, "clients/synthetic-client"))).exists(), true);
  } finally { await signOut(auth); await deleteApp(app); }
});
