const CONTACT_EMAIL =
  "mailto:info@fawcetttattoos.com?subject=Tattoo Consultation Request&body=Name:%0APhone Number:%0ATattoo Idea:%0APlacement:%0AApproximate Size:%0ABlack and Grey or Color:%0AReference Images:%0APreferred Artist:%0A";

const pricingSections = [
  {
    title: "Consultations",
    items: [
      "Virtual consult: $25–$50",
      "Social media DM consult: $25",
      "Email consult: $25",
      "Email + phone consult: $50",
      "Video chat consult: $50",
      "In-person consult: $75",
      "Allergy spot test included when requested during an in-person consult",
    ],
    note:
      "Consultation fees are paid for the artist’s time and do not come off the tattoo price.",
  },
  {
    title: "Design Fees",
    items: [
      "Digital design fee: $75/hour",
      "3 minimal edits included",
      "$25 per additional edit after 3 edits",
      "Rendered concepts available for larger custom work",
    ],
    note:
      "Design fees are separate from tattoo fees and do not come off the tattoo price.",
  },
  {
    title: "Tattoo Rates",
    items: [
      "One artist: $175/hour",
      "Two artists: $300/hour",
      "Cover-ups: $200/hour",
      "Reworks / touch-ups: $175/hour",
      "Minimum charge: $600 per person (all inclusive, 3 hours or less)",
      "Free 1-hour touch-up on our work within 1 year: $75 supply fee",
    ],
    note: "Taxes are included in listed prices.",
  },
  {
    title: "Permanent Makeup",
    items: [
      "Lips: $500–$700",
      "Eyebrows: $600–$1,000",
      "Eyeliner: $150–$600",
      "Cheek blushing: $300",
      "Touch-ups / refreshers within 1 year: $75 per procedure",
      "Touch-ups / refreshers after 1 year: $175 per procedure",
      "Correction of another artist’s work: full price",
    ],
  },
  {
    title: "Products & Extras",
    items: [
      "H2Ocean aftercare kit: $35–$40",
      "Numbing products: $15–$50",
      "Supply fee: $75 per session",
    ],
    note: "All listed prices include tax unless otherwise noted.",
  },
];

const premiumSessions = [
  {
    title: "Tapout Session",
    price: "$1,200",
    subtitle: "Up to 8 hours | 10 AM–7 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "H2Ocean aftercare kit",
      "Numbing product + application",
      "Up to 8 hours of tattoo time",
      "1-hour touch-up session value included",
    ],
    deposit: "$600 non-refundable booking fee required",
  },
  {
    title: "Double Tapout",
    price: "$2,000",
    subtitle: "Up to 8 hours with two artists | 10 AM–7 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "Aftercare kit",
      "Numbing product + application",
      "Up to 8 hours with two artists",
      "1-hour touch-up value included",
    ],
    deposit: "$1,000 non-refundable booking fee required",
  },
  {
    title: "Buyout Session",
    price: "$1,500",
    subtitle: "Up to 11 hours | 10 AM–10 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "H2Ocean aftercare kit",
      "Up to two numbing products + applications",
      "Up to 11 hours of tattoo time",
    ],
    deposit: "$850 non-refundable booking fee required",
  },
  {
    title: "Double Buyout",
    price: "$3,000",
    subtitle: "Up to 11 hours with two artists | 10 AM–10 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "Aftercare kits included",
      "Up to two numbing products + applications",
      "1-hour touch-up value included",
      "Up to 11 hours with two artists",
    ],
    deposit: "$1,500 non-refundable booking fee required",
  },
  {
    title: "Sleeve Commitment Packages",
    price: "$6,000+ arm | $8,000+ leg",
    subtitle: "Structured multi-session large-scale pricing",
    includes: [
      "Designed for committed sleeve projects",
      "Discounted session structure for qualifying clients",
      "Session planning, design time, supplies, and aftercare support included in package structure",
      "Bonus touch-up value included",
    ],
    deposit: "Consultation required for fit and package setup",
  },
  {
    title: "Back Piece Commitment Package",
    price: "$10,000+",
    subtitle: "For full back projects",
    includes: [
      "Built around multi-session completion",
      "Includes design time, supplies, aftercare, and session planning",
      "Consultation required for timeline and structure",
    ],
    deposit: "Consultation required for fit and package setup",
  },
  {
    title: "Buy the Piece",
    price: "$300 / $600 / $800 / $1,000",
    subtitle: "Portfolio-driven original designs",
    includes: [
      "For select original concepts created by the studio",
      "Limited availability",
      "May include additional usage and credit terms depending on the piece",
    ],
    deposit: "50% non-refundable deposit required",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
          <a href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </a>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Services & Pricing
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black md:text-6xl">
            Clear pricing. Structured sessions. Custom work.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Exact tattoo quotes are given during consultation once we review your
            concept, placement, size, and level of detail. Consultation fees and design
            fees are separate from tattoo fees unless otherwise stated.
          </p>

          <div className="mt-8">
            <a
              href={CONTACT_EMAIL}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
            >
              Request a Consultation
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
        <div className="grid gap-6 lg:grid-cols-2">
          {pricingSections.map((section) => (
            <article
              key={section.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8"
            >
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <ul className="mt-5 space-y-3 text-white/70">
                {section.items.map((item) => (
                  <li key={item} className="leading-7">
                    {item}
                  </li>
                ))}
              </ul>
              {section.note ? (
                <p className="mt-5 text-sm leading-7 text-white/50">{section.note}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Premium Session Options
          </p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">
            Full-session and large-project options
          </h2>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {premiumSessions.map((session) => (
              <article
                key={session.title}
                className="rounded-[2rem] border border-white/10 bg-black p-6 md:p-8"
              >
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  {session.subtitle}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{session.title}</h3>
                <p className="mt-3 text-2xl font-black text-white">{session.price}</p>

                <ul className="mt-5 space-y-3 text-white/70">
                  {session.includes.map((item) => (
                    <li key={item} className="leading-7">
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-sm leading-7 text-white/50">{session.deposit}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <h2 className="text-2xl font-bold">Pricing update notice</h2>
          <div className="mt-5 space-y-4 text-white/65">
            <p>
              When Fawcett Tattoos & Art Studio opened in 2013, the hourly tattoo
              rate was $150 per hour. That rate was held for many years before
              adjustments were made during and after the pandemic.
            </p>
            <p>
              As operating costs, supply costs, cost of living, education, and
              experience have increased, pricing has been updated to reflect the
              current market and level of service provided.
            </p>
            <p>
              Gift certificates must be redeemed within 1 year of purchase unless
              otherwise stated. Promotional pricing and sale offers apply only within
              the stated promotional period.
            </p>
            <p>
              Older unused vouchers may be reviewed at face value at the studio’s
              discretion and applied toward current pricing.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}