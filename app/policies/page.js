import Link from "next/link";

export const metadata = {
  title: "Policies",
  description:
    "Booking, deposit, cancellation, tattoo credit, privacy, and studio policies for Fawcett Tattoo & Art Studio in Edmonton.",
};

const policySections = [
  {
    title: "Booking & Consultations",
    text: [
      "Fawcett Tattoo & Art Studio is a private, appointment-based tattoo and art studio. Consultations, tattoo appointments, project reviews, and messages may be managed through the Tattoo Portal.",
      "Submitting a consult request, Tattoo Project Membership application, or Tattoo Portal message does not guarantee approval, booking, pricing, or artist availability.",
      "All tattoo projects are reviewed by the studio before moving forward. We may ask follow-up questions, request reference images, recommend changes, or decline a project if it is not the right fit.",
    ],
  },
  {
    title: "Deposits, Booking Fees & Drawing Fees",
    text: [
      "Some appointments or projects may require a deposit, in-store credit, booking fee, drawing fee, &/or design fee before time is reserved or design work begins.",
      "Any required in-store credit,  deposit, booking fee, drawing fee, design fee, supply fee, GST, or other mandatory cost will be disclosed before the client confirms the booking or enrollment.",
      "Deposits, in-store credits and fees may be non-refundable depending on the project, appointment type, artist preparation time, design work completed, and studio terms provided at the time of booking.",
    ],
  },
  {
    title: "Cancellation & Rescheduling",
    text: [
      "Clients are expected to give as much notice as possible if they need to cancel or reschedule an appointment.",
      "Short-notice cancellations, missed appointments, late arrivals, or repeated rescheduling may result in loss of deposit, rescheduling limits, or the need for a new deposit before rebooking.",
      "The studio may also reschedule appointments due to illness, emergencies, unsafe working conditions, artist availability, or other circumstances outside of our control.",
    ],
  },
  {
    title: "No-Shows & Late Arrivals",
    text: [
      "If a client does not arrive for an appointment and does not contact the studio, the appointment may be treated as a no-show.",
      "No-shows may result in loss of deposit, cancellation of future appointments, or a requirement to pay a new deposit before booking again.",
      "Late arrivals may shorten the available tattoo time, require rescheduling, or affect what can be completed during that session.",
    ],
  },
  {
    title: "Pricing, Estimates & Mandatory Costs",
    text: [
      "Tattoo pricing depends on artist, size, placement, complexity, detail level, color, skin, cover-up needs, design changes, healing considerations, session time, and project scope.",
      "Large projects may be estimated as a range. Estimates are not flat-rate guarantees unless the studio confirms a specific written offer.",
      "Mandatory costs are disclosed before confirmation whenever they apply. These may include tattoo time, deposits, booking fees, drawing fees, supply fees, GST, payment-processing fees, or other required costs.",
    ],
  },
  {
    title: "In-Studio Credit",
    text: [
      "In-Studio Credit is value recorded on a client account for use with Fawcett Tattoos & Art Studio according to studio terms.",
      "In-Studio Credit may come from approved payments, membership payments, gift certificates, transfers, promotions, or manual studio adjustments.",
      "In-Studio Credit is not cash, not a loan, not an investment, and not an ownership interest. It may have limits depending on the offer, payment method, project type, artist availability, and written studio terms.",
      "Using In-Studio Credit toward a project does not guarantee a flat-rate tattoo package. Final project cost still depends on the approved project estimate and actual work required.",
    ],
  },
  {
    title: "Gift Certificates & Tattoo Credit",
    text: [
      "Gift certificates and tattoo credit are handled according to the terms provided at purchase or issue.",
      "Older vouchers, promotional offers, discounted offers, and special campaigns may have different limits than regular gift certificates or standard In-Studio Credit.",
      "Clients should contact the studio before booking if they plan to use a gift certificate, tattoo credit, promotional credit, or older voucher.",
    ],
  },
  {
    title: "Tattoo Project Membership Program",
    text: [
      "The Tattoo Project Membership Program is a planning structure for approved clients who want to build In-Studio Credit toward a larger tattoo project over time.",
      "Membership payments are not a flat-rate tattoo package, discount, loan, investment, fundraiser, donation, ownership opportunity, or cash-return program.",
      "Before enrollment, the client must receive the payment schedule, project estimate or planning range, required costs, cancellation terms, pause/suspension options, credit-use terms, and refund or transfer terms.",
      "Submitting an application does not enroll the client. No payment is collected through the website application form.",
    ],
  },
  {
    title: "Payment Processing",
    text: [
      "Accepted payment methods may vary by project, session type, artist, and studio policy.",
      "Third-party payment providers may have their own approval rules, fees, limits, refund rules, and account requirements.",
      "The studio may set limits for certain payment methods. For example, buy-now-pay-later or third-party financing options may have lower in-studio limits because of fees or provider restrictions.",
    ],
  },
  {
    title: "Health, Safety & Eligibility",
    text: [
      "Clients must be honest about health, skin, allergy, medication, pregnancy, healing, and medical considerations that could affect tattoo safety.",
      "The studio may refuse or reschedule service if tattooing may be unsafe, if the client is not prepared, if the skin is not suitable, or if the project requires medical clearance.",
      "Clients must follow aftercare instructions. Healing results can vary based on skin, placement, lifestyle, immune response, aftercare, and other factors outside the studio’s control.",
    ],
  },
  {
    title: "Artwork, Designs & Reference Images",
    text: [
      "Custom tattoo designs, drawings, stencils, artwork, and project concepts created by the studio remain studio/artist intellectual property unless otherwise agreed in writing.",
      "Reference images help communicate style, placement, subject matter, and direction. They do not guarantee an exact copy, especially if the reference belongs to another artist, client, photographer, brand, or creator.",
      "Design changes may affect pricing, timeline, session length, and booking availability.",
    ],
  },
  {
    title: "Photo, Video & Content Release",
    text: [
      "The studio may ask permission to photograph or record tattoo work, healed results, studio processes, artwork, or project progress.",
      "A photo/video release may be requested before content is used for marketing, education, social media, website updates, prints, or portfolio use.",
      "Clients can ask questions about content use before signing a release. Some project offers may include specific content-use terms that must be confirmed in writing.",
    ],
  },
  {
    title: "Tattoo Portal, Records & Privacy",
    text: [
      "The Tattoo Portal may store client messages, consult requests, project details, appointments, payments, In-Studio Credit records, timeline notes, and membership-related records.",
      "Client information is used to manage studio communication, appointments, project planning, health/safety considerations, payments, credit records, and client service.",
      "Clients should not submit sensitive medical information unless it is relevant to tattoo safety or requested by the studio for project review.",
      "The studio takes reasonable steps to protect client records, but no online system can be guaranteed completely risk-free.",
    ],
  },
  {
    title: "Policy Changes",
    text: [
      "Studio policies may be updated as the business, pricing, services, tools, legal requirements, or payment systems change.",
      "The terms provided at the time of booking, enrollment, payment, or written confirmation may apply to that specific appointment or project.",
      "If anything is unclear, clients should contact the studio before booking, paying, or submitting a request.",
    ],
  },
];

export default function PoliciesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Studio Policies
          </p>

          <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            Policies, terms, and studio expectations.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
            Please review these policies before submitting a consult request,
            joining the Tattoo Portal, applying for the Tattoo Project
            Membership Program, purchasing tattoo credit, or booking an
            appointment.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button button-primary" href="/consult">
              Start a Consult
            </Link>

            <Link className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>

            <Link
              className="button button-secondary"
              href="/tattoo-project-membership"
            >
              Tattoo Credit Waitlist
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Important
          </p>

          <p className="mt-4 max-w-5xl text-base leading-8 text-white/72 md:text-lg">
            This page is a general studio policy overview. Specific appointment,
            project, membership, payment, credit, gift certificate, or content
            release terms may be provided separately in writing. If a specific
            written agreement conflicts with this overview, the written agreement
            for that project or transaction may apply.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-16 md:px-8">
        {policySections.map((section) => (
          <article
            key={section.title}
            className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7"
          >
            <h2 className="text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
              {section.title}
            </h2>

            <div className="mt-5 grid gap-4">
              {section.text.map((paragraph) => (
                <p
                  key={paragraph}
                  className="max-w-5xl text-base font-semibold leading-8 text-white/68"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
          <div className="grid gap-5 rounded-[2rem] border border-[#0000cc]/40 bg-[#0000cc]/15 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/55">
                Questions?
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Message the studio before booking.
              </h2>

              <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-white/70">
                If you are unsure about deposits, tattoo credit, appointment
                changes, health concerns, payment options, or project terms,
                contact us before confirming your appointment.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link className="button button-primary" href="/tattoo-portal">
                Open Tattoo Portal
              </Link>

              <a
                className="button button-secondary"
                href="mailto:info@fawcetttattoos.com"
              >
                Email the Studio
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}