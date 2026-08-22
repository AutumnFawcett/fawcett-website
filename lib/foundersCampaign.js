export const foundersCampaign = {
  title: "Fawcett Founders: Help Build the Next Chapter",
  eyebrow: "Private campaign preview",
  goalCents: 5000000,
  currency: "CAD",
  amountRaisedCents: 0,
  supporterCount: 0,
  minimumFounderSupportCents: 1000,
  story: [
    "Fawcett is preparing for its next chapter: a more ambitious home for tattooing, art, and the community that has grown around the studio.",
    "The Founders campaign is being designed as a way for early supporters to help make that expansion possible and to be permanently recognized as part of the story. Founder status is separate from VIP status, and recognition will be anonymous by default.",
  ],
  milestones: [
    {
      label: "Foundation",
      title: "Launch the Founders campaign",
      description:
        "Open confirmed support with clear terms, permanent Founder qualification, and an intentional anonymous-first recognition process.",
    },
    {
      label: "Build",
      title: "Strengthen the studio experience",
      description:
        "Direct campaign support toward the practical expansion of Fawcett's creative environment and the next chapter of the studio.",
    },
    {
      label: "Gather",
      title: "Create room for community",
      description:
        "Develop future opportunities for art, studio experiences, and meaningful Founder recognition as the campaign grows.",
    },
  ],
  rewardTiers: [
    {
      amountCents: 1000,
      title: "Founder",
      rewards: [
        "Founder number",
        "Permanent Founder status",
        "Optional future Founder Wall recognition",
      ],
    },
    {
      amountCents: 2500,
      title: "Digital Founder",
      rewards: ["Everything above", "Digital Founder badge"],
    },
    {
      amountCents: 5000,
      title: "Studio Supporter",
      rewards: ["Everything above", "Founder sticker pack"],
    },
    {
      amountCents: 10000,
      title: "Art Founder",
      rewards: ["Everything above", "Limited Founder art print"],
    },
    {
      amountCents: 25000,
      title: "Opening Founder",
      rewards: [
        "Everything above",
        "Founder shirt",
        "Grand-opening invitation and studio tour",
      ],
    },
  ],
};

export function formatCampaignCurrency(amountCents) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: foundersCampaign.currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}
