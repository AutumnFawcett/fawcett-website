import Link from "next/link";

const CONTACT_EMAIL =
  "mailto:info@fawcetttattoos.com?subject=Tattoo Consultation Request&body=Name:%0APhone Number:%0ATattoo Idea:%0APlacement:%0AApproximate Size:%0ABlack and Grey or Color:%0AReference Images:%0APreferred Artist:%0A";

const pricingSections = [
  {
    title: "Consultations",
    items: [
      "TattooPortal: FREE",
      "In-person consult: $25 per 30 minutes &/or $75 for spot test",
      "Email, Phone, Social DMs or Video consult: $25-$50",
      "Allergy spot test will be provided upon request during an in-person consult",
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
      "One artist: $200/hour",
      "Two artists: $300/hour",
      "Cover-ups/re-works: $200/hour",
      "Touch-ups: FREE-$200/hour",
      "Minimum charge: $300 per person (under 1 hour of tattoo time )",
      "FREE 1-hour touch-up within 1 year: Supply Fee not included.",
    ],
    note: "Taxes are included in listed prices.",
  },
  {
    title: "Tattoo Project Membership",
    items: [
      "Starter Member — $500 initial payment, then $150/month toward approved tattoo credit.",
      "Builder Member — $750 initial payment, then $300/month toward approved tattoo credit.",
      "Commitment Member — $1,000 initial payment, then $500/month toward approved tattoo credit.",
      "Membership tiers are not flat-rate tattoos. Payments build tattoo credit toward an approved project.",
    ],
    note:
      "No payment is collected through the website application. Full terms, payment schedule, refund/credit policy, and mandatory costs are disclosed before enrollment.",
  },
  {
    title: "Permanent Makeup",
    items: [
      "Lips: $300–$600",
      "Eyebrows: $500–$1,000",
      "Eyeliner: $200–$600",
      "Cheek blushing: $300",
      "Touch-ups / refreshers within 1 year: $100 per procedure",
      "Touch-ups / refreshers after 1 year: $175 per procedure",
      "Correction of another artist’s work: full price",
    ],
  },
  {
    title: "Products & Extras",
    items: [
      "H2Ocean aftercare: $15–$50",
      "Numbing products: $15–$50",
      "Supply fee: $100 per session",
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
      "$2,000 in Value tax included",
    ],
    deposit: "$500 non-refundable booking fee required",
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
      "$3,500 in Value tax included",
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
      "$3,000 in Value tax included",
    ],
    deposit: "$500 non-refundable booking fee required",
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
      "$5,000 in Value tax included",
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
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Services & Pricing
          </p>

          <h1 className="mt-3 max-w-4xl text-4xl font-black md:text-6xl">
            Clear Pricing. Structured Sessions. Custom work.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Exact tattoo quotes are given during consultation once we review
            your concept, placement, size, and level of detail. Consultation
            fees and design fees are separate from tattoo fees unless otherwise
            stated. Taxes are included in listed prices unless otherwise stated.
          </p>

          <div className="mt-8">
            <a
              href={CONTACT_EMAIL}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
            >
              Request a Consultation
            </a>
            <a className="button button-secondary" href="/tattoo-portal">
              Tlattoo Porta Login
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
                <p className="mt-5 text-sm leading-7 text-white/50">
                  {section.note}
                </p>
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

                <p className="mt-3 text-2xl font-black text-white">
                  {session.price}
                </p>

                <ul className="mt-5 space-y-3 text-white/70">
                  {session.includes.map((item) => (
                    <li key={item} className="leading-7">
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-sm leading-7 text-white/50">
                  {session.deposit}
                </p>
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
              When Fawcett Tattoo & Art Studio opened in 2013, the hourly
              tattoo rate was $150 per hour. That rate was held for many years
              before adjustments were made during and after the pandemic.
            </p>

            <p>
              As operating costs, supply costs, cost of living, education, and
              experience have increased, pricing has been updated to reflect the
              current market and level of service provided.
            </p>

            <p>All pricing is subject to change without notice.</p>

            <p>
              Gift certificates must be redeemed within 1 year of purchase
              unless otherwise stated. Promotional pricing and sale offers apply
              only within the stated promotional period.
            </p>

            <p>
              Older unused vouchers may be reviewed at face value at the
              studio’s discretion and applied toward current pricing.
            </p>
          </div>
        </div>
      </section>

            <section className="pricing-credit-callout">
        <div>
          <p className="eyebrow">Tattoo Credit</p>
          <h2>Planning a larger project?</h2>
        </div>

        <p>
          The Tattoo Project Membership Program is being designed for approved clients
          who want to build In-Studio Credit toward a larger custom tattoo project over
          time. This is not a flat-rate tattoo package, and no payment is collected
          through the website application.
        </p>

        <a className="button button-primary" href="/tattoo-project-membership">
          Apply for the Waitlist
        </a>
      </section>
    </main>
  );
}