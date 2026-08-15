import Link from "next/link";
import MembershipApplicationForm from "@/components/MembershipApplicationForm";

export const metadata = {
  title: "Tattoo Project Membership",
  description:
    "Apply for the Tattoo Project Membership waitlist at Fawcett Tattoos & Art Studio. Build In-Studio Credit toward an approved larger tattoo project.",
};

const membershipTiers = [
  {
    title: "Starter Member",
    price: "$500 initial",
    monthly: "$150/month",
    minimum: "$2,000+ project",
    description:
      "Best for clients planning a medium custom project and wanting to build In-Studio Credit over time.",
  },
  {
    title: "Builder Member",
    price: "$750 initial",
    monthly: "$300/month",
    minimum: "$3,500+ project",
    description:
      "Best for clients planning a larger custom tattoo, cover-up, or multi-session piece.",
  },
  {
    title: "Commitment Member",
    price: "$1,000 initial",
    monthly: "$500/month",
    minimum: "$6,000+ project",
    description:
      "Best for sleeve commitments, large-scale work, and serious multi-session planning.",
  },
];

const howItWorks = [
  {
    title: "1. Apply",
    text: "Submit your project idea, placement, budget comfort, artist preference, and timeline through the waitlist form.",
  },
  {
    title: "2. Studio Review",
    text: "We review project fit, artist availability, health/readiness, estimated scope, and whether a membership structure makes sense.",
  },
  {
    title: "3. Confirm Terms",
    text: "If approved, the studio provides the payment schedule, project estimate or planning range, required costs, pause/cancel terms, and credit-use terms before enrollment.",
  },
  {
    title: "4. Build Credit",
    text: "Approved payments would build In-Studio Credit toward the approved tattoo project according to studio terms.",
  },
];

const importantNotes = [
  "This is an interest/waitlist application only.",
  "No payment is collected through this website application.",
  "Submitting an application does not guarantee approval, booking, pricing, or artist availability.",
  "Membership payments are not a flat-rate tattoo package.",
  "Final project cost depends on the approved project estimate, artist, size, placement, complexity, skin, cover-up needs, design changes, healing, and session time.",
  "All mandatory costs are disclosed before enrollment.",
];

const faqs = [
  {
    question: "Are these flat-rate tattoo prices?",
    answer:
      "No. The Tattoo Project Membership Program is not a flat-rate tattoo package. The tiers are a planning structure for approved clients to build In-Studio Credit toward an approved tattoo project. Final pricing depends on the project estimate, artist, size, placement, complexity, skin, cover-up needs, design changes, healing, and session time.",
  },
  {
    question: "Does applying guarantee acceptance?",
    answer:
      "No. Submitting an application does not guarantee approval, booking, pricing, artist availability, or membership enrollment. The studio reviews each request before confirming next steps.",
  },
  {
    question: "Do the payments go toward my tattoo?",
    answer:
      "If approved and enrolled, payments would build In-Studio Credit toward the approved tattoo project according to the written terms provided by the studio before enrollment.",
  },
  {
    question: "Are there extra costs?",
    answer:
      "There may be additional required costs depending on the project, including supplies, GST, deposits, booking fees, drawing or design fees, processing fees, or other project-specific costs. Required costs are disclosed before enrollment.",
  },
  {
    question: "Can I pay today?",
    answer:
      "No payment is collected through this website application. This page is for waitlist and application review only. If approved, the studio will provide the full terms before any payment is accepted.",
  },
  {
    question: "Can I pause or cancel later?",
    answer:
      "Pause or cancellation requests must be reviewed by the studio. Approval, credit use, refunds, transfers, and future booking depend on the written terms, project status, payment method, and studio policy.",
  },
];

export default function TattooProjectMembershipPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Tattoo Credit Waitlist
          </p>

          <h1 className="mt-4 max-w-6xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            The Tattoo Project Membership Program.
          </h1>

          <p className="mt-6 max-w-4xl text-lg leading-8 text-white/70">
            A planning structure for approved clients who want to build
            In-Studio Credit toward a larger custom tattoo project over time.
            This is designed for serious multi-session work, not impulse
            bookings or flat-rate tattoo packages.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a className="button button-primary" href="#membership-application">
              Apply for the Waitlist
            </a>

            <Link className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>

            <Link className="button button-secondary" href="/pricing">
              View Pricing
            </Link>

            <Link className="button button-secondary" href="/policies">
              View Policies
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {membershipTiers.map((tier) => (
            <article
              key={tier.title}
              className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Founding Interest Tier
              </p>

              <h2 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {tier.title}
              </h2>

              <div className="mt-5 flex flex-wrap gap-3">
                <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)]">
                  {tier.price}
                </p>

                <p className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white">
                  {tier.monthly}
                </p>
              </div>

              <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-white/45">
                {tier.minimum}
              </p>

              <p className="mt-5 text-base font-semibold leading-8 text-white/68">
                {tier.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            How It Works
          </p>

          <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Apply first. Review first. Confirm terms before payment.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {howItWorks.map((step) => (
              <article
                key={step.title}
                className="rounded-[1.6rem] border border-white/10 bg-black p-5 md:p-7"
              >
                <h3 className="text-2xl font-black tracking-[-0.04em] text-white">
                  {step.title}
                </h3>

                <p className="mt-4 text-base font-semibold leading-8 text-white/68">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="grid gap-5 rounded-[2rem] border border-[#0000cc]/40 bg-[#0000cc]/15 p-5 md:grid-cols-[0.75fr_1fr] md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">
              Important
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              This is not a loan, investment, or flat-rate tattoo.
            </h2>
          </div>

          <ul className="grid gap-3">
            {importantNotes.map((note) => (
              <li
                key={note}
                className="text-base font-semibold leading-8 text-white/72"
              >
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="membership-application"
        className="mx-auto max-w-5xl scroll-mt-24 px-5 pb-16 md:px-8"
      >
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Waitlist Application
          </p>

          <h2 className="mt-4 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Apply for review.
          </h2>

          <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/70">
            This form creates or uses your Tattoo Portal account so we can keep
            your application, messages, project notes, payment requests, and
            studio updates organized in one place.
          </p>

          <div className="mt-8">
            <MembershipApplicationForm />
          </div>
        </div>
      </section>

            <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Frequently Asked Questions
          </p>

          <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Questions before applying.
          </h2>

          <div className="mt-10 grid gap-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-5"
              >
                <summary className="cursor-pointer list-none text-base font-black text-white md:text-lg">
                  {faq.question}
                </summary>

                <p className="mt-4 max-w-5xl text-base font-semibold leading-8 text-white/68">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-10 border-t border-white/10 pt-10">
            <Link className="button button-secondary" href="/">
              Back to Tattoo Website
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}