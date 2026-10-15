import { fingerprint } from "../migration/model.mjs";
// A pending private edit does not revoke the last approved snapshot. Withheld or
// absent metadata is never permission to create/rebuild/deliver a public view.
export function approvedSnapshot(policy, view, uid) {
  try {
    return policy?.schemaVersion === 1 && ["approved", "review_required"].includes(policy.state)
    && typeof uid === "string" && view?.clientUid === uid && policy.approved?.clientUid === uid
    && fingerprint(policy.approved) === fingerprint(view);
  } catch { return false; }
}
