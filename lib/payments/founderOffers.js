const offers = [
  ["founder-10-v1", 1000, "Founder"],
  ["digital-founder-25-v1", 2500, "Digital Founder"],
  ["studio-supporter-50-v1", 5000, "Studio Supporter"],
  ["art-founder-100-v1", 10000, "Art Founder"],
  ["opening-founder-250-v1", 25000, "Opening Founder"],
];

export const FOUNDER_OFFERS = Object.freeze(Object.fromEntries(offers.map(([offerId, amountCents, itemName]) => [
  offerId,
  Object.freeze({ offerId, offerVersion: 1, amountCents, currency: "CAD", purpose: "founder", itemName }),
])));

export function getFounderOffer(offerId) {
  if (typeof offerId !== "string" || !Object.hasOwn(FOUNDER_OFFERS, offerId)) {
    throw new Error("unknown_offer");
  }
  return FOUNDER_OFFERS[offerId];
}

export function assertMoney(amountCents, currency = "CAD") {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("invalid_amount");
  if (currency !== "CAD") throw new Error("invalid_currency");
}
