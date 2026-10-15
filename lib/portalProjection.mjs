// Admin source documents retain original data and IDs. Portal documents are
// intentionally smaller, independently authorized records, never UI redactions.
const identity = ["clientUid", "clientName", "clientEmail", "phone", "instagram", "createdAt", "updatedAt"];
export const PORTAL_FIELDS = Object.freeze({
  clients: [...identity, "status", "source", "preferredArtist"],
  consultRequests: [...identity, "preferredContactMethod", "preferredArtist", "assignedInbox", "assignedArtistId", "status", "request", "coverUp", "timeline", "acknowledgements", "projectId", "conversationId"],
  membershipApplications: [...identity, "programName", "applicationType", "preferredContactMethod", "preferredArtist", "assignedInbox", "assignedArtistId", "status", "project", "coverUp", "budget", "timeline", "acknowledgements", "membershipOffer", "projectId", "conversationId"],
  conversations: [...identity, "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId", "sourceType", "sourceId", "assignedInbox", "assignedArtistId", "status", "subject", "lastMessagePreview", "lastMessageAt", "unreadForAdmin", "unreadForClient"],
  messages: ["clientUid", "clientEmail", "conversationId", "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId", "sourceType", "sourceId", "senderRole", "senderName", "body", "createdAt"],
  projects: [...identity, "consultRequestId", "applicationId", "projectName", "status", "assignedInbox", "assignedArtistId", "preferredArtist", "source", "membership", "project", "coverUp", "timeline", "estimate", "mandatoryCosts", "clientProjectSummary"],
  appointments: [...identity, "projectId", "projectName", "title", "appointmentType", "type", "status", "startAt", "endAt", "durationMinutes", "assignedInbox", "assignedArtistId", "location", "clientVisibleNotes"],
  payments: [...identity, "projectId", "projectName", "appointmentId", "appointmentTitle", "paymentType", "paymentMethod", "creditHandling", "status", "amountCents", "amountDisplay", "currency", "receivedAt", "amount", "paymentAmount", "type"],
  creditLedger: [...identity, "projectId", "projectName", "paymentId", "appointmentId", "entryType", "transactionType", "status", "deltaCents", "amountCents", "currency", "description", "title", "reason", "receivedAt"],
  membershipOffers: [...identity, "applicationId", "projectId", "tier", "tierLabel", "status", "initialPaymentCents", "monthlyPaymentCents", "minimumProjectValueCents", "paymentStartDate", "termsSummary", "clientMessage", "offerStatus", "sentAt"],
  membershipOfferResponses: ["clientUid", "applicationId", "responseType", "responseStatus", "clientNote", "createdAt", "updatedAt"],
  membershipChangeRequests: [...identity, "requestType", "requestStatus", "reason", "clientAcknowledgement"],
  projectTimeline: [...identity, "projectId", "projectName", "entryType", "status", "title", "body", "clientVisible", "important"],
});
export const PORTAL_MAP_FIELDS = Object.freeze({
  source: ["sourceType", "sourceId"],
  project: ["projectType", "tattooIdea", "idea", "colourPreference", "placement", "bodySide", "sizeCategory", "detailLevel", "budgetRange", "referenceLinks"],
  request: ["projectType", "tattooIdea", "placement", "bodySide", "approximateSize", "colourPreference", "styleDirection", "budgetRange", "availability", "referenceLinks"],
  coverUp: ["isCoverUp", "coverUpDescription"],
  budget: ["tierInterest", "monthlyComfort", "paymentStyle"],
  timeline: ["timeline", "isUrgent", "planningTimeline", "completionWindow", "availability"],
  acknowledgements: ["applicationOnly", "noPaymentCollected", "noGuarantee", "notInvestmentLoanDiscount", "mandatoryCostsBeforeEnrollment", "termsBeforeEnrollment", "studioPolicy", "informationAccurate", "contactPermission", "acknowledgementAccurate", "acknowledgementNoGuarantee", "acknowledgementPolicy"],
  clientAcknowledgement: ["understandsThisIsARequest", "understandsStudioMustReview", "understandsCreditBalanceDoesNotAutomaticallyDisappear"],
  membership: ["tierInterest", "monthlyComfort", "paymentStyle", "membershipStatus"],
  estimate: ["estimateLowCents", "estimateHighCents", "estimatedSessions", "estimatedHours", "hourlyRateCents", "updatedAt"],
  mandatoryCosts: ["tattooTimeDisclosed", "suppliesDisclosed", "gstDisclosed", "depositDisclosed", "bookingFeeDisclosed", "drawingFeeDisclosed", "processingFeeDisclosed", "otherCostsDisclosed"],
  membershipOffer: ["tier", "tierLabel", "initialPaymentDollars", "monthlyPaymentDollars", "minimumProjectValueDollars", "initialPaymentCents", "monthlyPaymentCents", "minimumProjectValueCents", "paymentStartDate", "termsSummary", "clientMessage", "offerStatus", "sentAt", "updatedAt"],
});
export const PUBLIC_ARTIST_REFERENCES = [null, "artist_ben", "artist_autumn", "ben", "autumn"];
export const PRIVATE_TIMELINE_TYPES = ["health_skin_note", "internal_note", "admin_note"];
export const PUBLISHED_OFFER_STATUSES = ["membership_offer_sent", "client_reviewing_offer", "membership_approved", "membership_active", "membership_paused", "membership_cancelled", "accepted", "declined"];
const plain = (value) => value && Object.getPrototypeOf(value) === Object.prototype;
const assertLeaf = (value, key) => {
  if (plain(value) || Array.isArray(value)) throw new Error(`Structured value in scalar portal field: ${key}`);
};
const pick = (data, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]));

export function portalProjection(collectionName, source) {
  const fields = PORTAL_FIELDS[collectionName];
  if (!fields) throw new Error("Unsupported portal collection");
  if (collectionName === "membershipOffers" && !PUBLISHED_OFFER_STATUSES.includes(source.offerStatus || source.status)) return null;
  if (collectionName === "projectTimeline" && (!source.clientVisible || PRIVATE_TIMELINE_TYPES.includes(source.entryType))) return null;
  const result = pick(source, fields);
  if (Object.hasOwn(result, "assignedArtistId") && !PUBLIC_ARTIST_REFERENCES.includes(result.assignedArtistId)) delete result.assignedArtistId;
  for (const [key, fields] of Object.entries(PORTAL_MAP_FIELDS)) {
    if (Object.hasOwn(result, key) && plain(result[key])) {
      result[key] = pick(result[key], fields);
      for (const [leaf, value] of Object.entries(result[key])) assertLeaf(value, `${key}.${leaf}`);
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (!(key in PORTAL_MAP_FIELDS)) assertLeaf(value, key);
  }
  if (collectionName === "clients" && result.source !== undefined && typeof result.source !== "string") throw new Error("Client source must be a string");
  if (collectionName === "membershipApplications" && result.membershipOffer && !PUBLISHED_OFFER_STATUSES.includes(result.membershipOffer.offerStatus)) delete result.membershipOffer;
  if (collectionName === "projects" && typeof source.adminReview?.clientProjectSummary === "string") result.clientProjectSummary = source.adminReview.clientProjectSummary;
  return result;
}

// Apply the object/dotted-key patches used by the CRM without mutating snapshots.
// SDK timestamp/value objects are kept intact rather than JSON-serialized.
export function applyRecordPatch(source, patch, merge = false) {
  const result = { ...source };
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split(".");
    let target = result;
    for (const key of keys.slice(0, -1)) {
      target[key] = { ...(target[key] || {}) };
      target = target[key];
    }
    const key = keys.at(-1);
    target[key] = merge && plain(value) && plain(target[key]) ? applyRecordPatch(target[key], value, true) : value;
  }
  return result;
}
