import Link from "next/link";

export const metadata = {
  title: "Pricing",
  description:
    "Tattoo pricing, consult fees, design fees, premium sessions, In-Studio Credit, and Tattoo Project Membership information for Fawcett Tattoos & Art Studio in Edmonton.",
};

const offerCards = [
  {
    title: "TAPOUT Session",
    price: "$1,200",
    eyebrow: "Up to 8 hours",
    description:
      "A full-day style session for approved projects that fit the structure.",
    href: "#tapout-session",
  },
  {
    title: "BUYOUT Session",
    price: "$1,500",
    eyebrow: "Up to 11 hours",
    description:
      "A larger session option for approved work with extended tattoo time.",
    href: "#buyout-session",
  },
  {
    title: "Double TAPOUT",
    price: "$2,000",
    eyebrow: "Two artists",
    description:
      "Up to 8 hours with two artists for approved projects and availability.",
    href: "#double-tapout",
  },
  {
    title: "Double BUYOUT",
    price: "$3,000",
    eyebrow: "Two artists",
    description:
      "Extended two-artist session option for approved large-scale work.",
    href: "#double-buyout",
  },
  {
    title: "Commitment Packages",
    price: "$6,000+",
    eyebrow: "Sleeves & back pieces",
    description:
      "Structured multi-session options for committed large-scale projects.",
    href: "#commitment-packages",
  },
  {
    title: "Buy the Piece",
    price: "$300+",
    eyebrow: "Portfolio designs",
    description:
      "Studio-created concepts and designs offered for select portfolio work.",
    href: "#buy-the-piece",
  },
];

const pricingSections = [
  {
    title: "Consultations",
    price: "Free–$75",
    note: "Consultation fees are paid for the artist’s time and do not come off the tattoo price.",
    items: [
      "Tattoo Portal consult/request: Free",
      "In-person consult: $25 per 30 minutes",
      "In-person consult with allergy/spot test: $75",
      "Allergy spot tests are available by request during an in-person consult.",
      "Submitting a consult request does not guarantee approval, booking, pricing, or artist availability.",
    ],
  },
  {
    title: "Design Fees",
    price: "$75/hour",
    note: "Design fees are separate from tattoo fees and do not come off the tattoo price.",
    items: [
      "Digital design fee: $75/hour",
      "3 minimal edits included",
      "$25 per additional edit after 3 edits",
      "Rendered concepts may be available for larger custom work.",
      "Design changes may affect pricing, timeline, and appointment readiness.",
    ],
  },
  {
    title: "Tattoo Rates",
    price: "$200/hour",
    note: "Taxes are included in listed prices unless otherwise stated.",
    items: [
      "One artist: $200/hour",
      "Two artists: $300/hour",
      "Cover-ups/re-works: $200/hour",
      "Touch-ups: Free–$200/hour",
      "Minimum charge: $300 per person for under 1 hour of tattoo time.",
      "Free 1-hour touch-up within 1 year; supply fee not included.",
    ],
  },
  {
    title: "Large-Scale Projects",
    price: "$2,000+",
    note: "Sleeves, back pieces, leg pieces, cover-ups, and multi-session custom work.",
    items: [
      "Large projects usually require planning, multiple appointments, and a realistic budget.",
      "Project estimates depend on size, placement, detail, color, skin, cover-up needs, healing, and session time.",
      "A project estimate is not a flat-rate guarantee unless confirmed in a specific written offer.",
    ],
  },
  {
    title: "Permanent Makeup",
    price: "$200–$1,000",
    note: "Pricing depends on procedure, correction needs, and touch-up timing.",
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
    price: "$15+",
    note: "All listed prices include tax unless otherwise noted.",
    items: [
      "H2Ocean aftercare: $15–$50",
      "Numbing products: $15–$50",
      "Supply fee: $100 per session",
      "Additional products or supplies may be recommended depending on project size, skin, and healing needs.",
    ],
  },
  {
    title: "In-Studio Credit",
    price: "Account Value",
    note: "Recorded value for approved use with the studio.",
    items: [
      "In-Studio Credit may be added from approved payments, gift certificates, membership payments, or studio adjustments.",
      "In-Studio Credit is not cash, not a loan, not an investment, and not an ownership interest.",
      "Use of In-Studio Credit may depend on studio terms, payment method, artist availability, project type, and written confirmation.",
    ],
  },
  {
    title: "Payment Methods",
    price: "Varies",
    note: "Payment options may depend on the project or session type.",
    items: [
      "Accepted payment methods may include cash, e-transfer, debit/credit, In-Studio Credit, or approved third-party options.",
      "Third-party providers may have their own approval rules, fees, refund rules, and limits.",
      "Afterpay or similar options may be limited for in-studio purchases, currently expected to stay around $400–$600 depending on fees and studio approval.",
    ],
  },
];

const premiumSessions = [
  {
    id: "tapout-session",
    title: "TAPOUT Session",
    price: "$1,200",
    subtitle: "Up to 8 hours | 10 AM–7 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "H2Ocean aftercare kit",
      "Numbing product + application",
      "Up to 8 hours of tattoo time",
      "1-hour touch-up session value included",
      "$2,000 in value, tax included",
    ],
    deposit: "$500 non-refundable booking fee required",
  },
  {
    id: "double-tapout",
    title: "Double TAPOUT",
    price: "$2,000",
    subtitle: "Up to 8 hours with two artists | 10 AM–7 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "Aftercare kit",
      "Numbing product + application",
      "Up to 8 hours with two artists",
      "1-hour touch-up value included",
      "$3,500 in value, tax included",
    ],
    deposit: "$1,000 non-refundable booking fee required",
  },
  {
    id: "buyout-session",
    title: "BUYOUT Session",
    price: "$1,500",
    subtitle: "Up to 11 hours | 10 AM–10 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "H2Ocean aftercare kit",
      "Up to two numbing products + applications",
      "Up to 11 hours of tattoo time",
      "$3,000 in value, tax included",
    ],
    deposit: "$500 non-refundable booking fee required",
  },
  {
    id: "double-buyout",
    title: "Double BUYOUT",
    price: "$3,000",
    subtitle: "Up to 11 hours with two artists | 10 AM–10 PM",
    includes: [
      "1 hour in-session design time",
      "Supply fee included",
      "Aftercare kits included",
      "Up to two numbing products + applications",
      "1-hour touch-up value included",
      "Up to 11 hours with two artists",
      "$5,000 in value, tax included",
    ],
    deposit: "$1,500 non-refundable booking fee required",
  },
  {
    id: "commitment-packages",
    title: "Sleeve Commitment Package",
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
    id: "back-piece-commitment",
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
    id: "buy-the-piece",
    title: "Buy the Piece",
    price: "$300 / $600 / $800 / $1,000",
    subtitle: "Portfolio-driven original designs",
    includes: [
      "For select original concepts created by the studio",
      "Limited availability",
      "May include additional usage and credit terms depending on the piece",
      "Future plan: link this to a dedicated page with available portfolio concepts and pre-drawn designs.",
    ],
    deposit: "50% non-refundable deposit required",
  },
];

const membershipTiers = [
  {
    title: "Starter Member",
    initial: "$500 initial",
    monthly: "$150/month",
    minimum: "$2,000+ project",
  },
  {
    title: "Builder Member",
    initial: "$750 initial",
    monthly: "$300/month",
    minimum: "$3,500+ project",
  },
  {
    title: "Commitment Member",
    initial: "$1,000 initial",
    monthly: "$500/month",
    minimum: "$6,000+ project",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Services & Pricing
          </p>

          <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            Clear pricing. Structured sessions. Custom work.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
            Exact tattoo quotes are given after we review your concept,
            placement, size, level of detail, skin, cover-up needs, design
            direction, and session goals. Taxes are included in listed prices
            unless otherwise stated.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button button-primary" href="/consult">
              Start Free Consult
            </Link>

            <Link className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>

            <Link className="button button-secondary" href="/policies">
              View Policies
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="grid gap-5 rounded-[2rem] border border-[#0000cc]/40 bg-[#0000cc]/15 p-5 md:grid-cols-[0.7fr_1fr_auto] md:items-center md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">
              Tattoo Credit
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Planning a larger project?
            </h2>
          </div>

          <p className="max-w-3xl text-base font-semibold leading-8 text-white/72">
            The Tattoo Project Membership Program is being designed for approved
            clients who want to build In-Studio Credit toward a larger custom
            tattoo project over time. This is not a flat-rate tattoo package,
            and no payment is collected through the website application.
          </p>

          <Link
            className="button button-primary whitespace-nowrap"
            href="/tattoo-project-membership"
          >
            Apply for the Waitlist
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <p className="text-xs uppercase tracking-[0.32em] text-white/45">
          Special Offers
        </p>

        <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
          Featured session options.
        </h2>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {offerCards.map((offer) => (
            <Link
              key={offer.title}
              href={offer.href}
              className="group rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 text-white no-underline transition hover:-translate-y-1 hover:border-[#0000cc]/70 hover:bg-[#0000cc]/15 md:p-7"
            >
              <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">
                {offer.eyebrow}
              </p>

              <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {offer.title}
              </h3>

              <p className="mt-5 text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">
                {offer.price}
              </p>

              <p className="mt-5 text-base font-semibold leading-8 text-white/68">
                {offer.description}
              </p>

              <span className="mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white group-hover:border-[#0000cc]/60">
                View what’s included
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 md:grid-cols-2 md:px-8">
        {pricingSections.map((section) => (
          <article
            key={section.title}
            className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                  {section.title}
                </h2>
              </div>

              <p className="shrink-0 rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-6 py-3 text-xl font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)] md:text-2xl">
                {section.price}
              </p>
            </div>

            <p className="mt-4 max-w-xl text-sm font-bold uppercase tracking-[0.18em] text-white/45">
              {section.note}
            </p>

            <details className="group mt-6">
              <summary className="inline-flex cursor-pointer list-none rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white transition hover:border-[#0000cc]/60 hover:bg-[#0000cc]/15">
                View details
              </summary>

              <ul className="mt-6 grid gap-3">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="text-base font-semibold leading-8 text-white/68"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </section>

      <section
        id="premium-sessions"
        className="border-y border-white/10 bg-white/[0.02]"
      >
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Premium Session Options
          </p>

          <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            TAPOUT, BUYOUT, and commitment offers.
          </h2>

          <p className="mt-5 max-w-4xl text-base font-semibold leading-8 text-white/70">
            These special offers are available only for approved projects that
            fit the session structure. Design direction, placement, skin,
            project readiness, artist availability, and booking terms must be
            confirmed before scheduling.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {premiumSessions.map((session) => (
              <article
                id={session.id}
                key={session.title}
                className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-black p-5 md:p-7"
              >
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  {session.subtitle}
                </p>

                <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                  <h3 className="text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                    {session.title}
                  </h3>

                <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-6 py-3 text-xl font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)] md:text-2xl">
                  {session.price}
                </p>
                </div>

                <ul className="mt-6 grid gap-3">
                  {session.includes.map((item) => (
                    <li
                      key={item}
                      className="text-base font-semibold leading-8 text-white/68"
                    >
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 rounded-[1rem] border border-white/10 bg-white/[0.045] p-4 text-sm font-bold leading-7 text-white/62">
                  {session.deposit}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Tattoo Project Membership
          </p>

          <h2 className="mt-4 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Founding member interest tiers.
          </h2>

          <p className="mt-5 max-w-4xl text-base font-semibold leading-8 text-white/70">
            These tiers are for planning and application review only. They are
            not flat-rate tattoos. Payments would build In-Studio Credit toward
            an approved tattoo project after full terms are reviewed and
            confirmed by the studio.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {membershipTiers.map((tier) => (
              <article
                key={tier.title}
                className="rounded-[1.4rem] border border-white/10 bg-black/35 p-5"
              >
                <h3 className="text-xl font-black text-white">{tier.title}</h3>

                <div className="mt-5 grid gap-3 text-base font-semibold leading-7 text-white/70">
                  <p>{tier.initial}</p>
                  <p>{tier.monthly}</p>
                  <p>{tier.minimum}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="button button-primary"
              href="/tattoo-project-membership"
            >
              Apply for the Waitlist
            </Link>

            <Link className="button button-secondary" href="/policies">
              Read Policies
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-8">
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
            Pricing update notice
          </h2>

          <div className="mt-5 grid gap-4 text-base font-semibold leading-8 text-white/68">
            <p>
              When Fawcett Tattoos & Art Studio opened in 2013, the hourly
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

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
          <div className="grid gap-5 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Need help choosing?
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Start with a Tattoo Portal consult.
              </h2>

              <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-white/70">
                Tell us the idea, placement, size, style, and budget. We will
                review your request and reply through the Tattoo Portal.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link className="button button-primary" href="/consult">
                Start Free Consult
              </Link>

              <Link className="button button-secondary" href="/tattoo-portal">
                Tattoo Portal Login
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}