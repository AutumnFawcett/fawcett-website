const offers = [
  ["founder-10-v1", 1000, "Founder", ["Permanent Founder number", "Permanent Founder status", "Optional future Founder Wall recognition"]],
  ["digital-founder-25-v1", 2500, "Digital Founder", ["Digital Founder badge"]],
  ["studio-supporter-50-v1", 5000, "Studio Supporter", ["Founder sticker pack"]],
  ["art-founder-100-v1", 10000, "Art Founder", ["Limited Founder art print"]],
  ["opening-founder-250-v1", 25000, "Opening Founder", ["Founder shirt", "Grand-opening invitation and studio tour"]],
];

export const FOUNDER_OFFERS = Object.freeze(Object.fromEntries(offers.map(([offerId, amountCents, itemName, benefits]) => [
  offerId,
  Object.freeze({ offerId, offerVersion: 1, amountCents, currency: "CAD", purpose: "founder", itemName, benefits: Object.freeze(benefits) }),
])));

export const FOUNDER_TIERS = Object.freeze(Object.values(FOUNDER_OFFERS)
  .sort((a, b) => a.amountCents - b.amountCents)
  .map((offer, index, sorted) => Object.freeze({
    id: offer.offerId,
    name: offer.itemName,
    thresholdCents: offer.amountCents,
    additionalBenefits: offer.benefits,
    benefits: Object.freeze(sorted.slice(0, index + 1).flatMap((tier) => tier.benefits)),
  })));

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
