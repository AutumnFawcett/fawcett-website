// A source ID or matching contact value is never an Authentication identity.
export function legacyClientKey(record) {
  return typeof record.clientUid === "string" && record.clientUid
    ? `account:${record.clientUid}`
    : `legacy:${record.sourceCollection}:${record.id}`;
}
