"use client";

import { useEffect, useState } from "react";
import { initializeFirebaseClient } from "@/lib/firebaseClient";

// Gate every Firebase consumer, rather than rendering a component whose effects
// might call the SDK with undefined services during hydration.
export function withFirebase(Component) {
  function FirebaseFeature(props) {
    const [status, setStatus] = useState("loading");

    useEffect(() => {
      try {
        initializeFirebaseClient();
        setStatus("ready");
      } catch {
        // Do not display config values or silently substitute a different project.
        setStatus("error");
      }
    }, []);

    if (status === "error") {
      return (
        <section className="consult-card" role="alert">
          <h2>Unable to connect to the Tattoo Portal</h2>
          <p>This deployment’s Firebase configuration is missing or invalid. Login, consultation submissions and other account features are unavailable here. No request has been submitted.</p>
          <p>Please contact the studio or try again after the configuration has been corrected.</p>
          <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Try Again</button>
        </section>
      );
    }
    if (status !== "ready") return <p role="status">Loading account features…</p>;
    return <Component {...props} />;
  }
  FirebaseFeature.displayName = `WithFirebase(${Component.name})`;
  return FirebaseFeature;
}
