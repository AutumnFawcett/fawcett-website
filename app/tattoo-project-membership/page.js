import Link from "next/link";
import MembershipApplicationForm from "@/components/MembershipApplicationForm";

export const metadata = {
  title: "Tattoo Project Membership Program | Fawcett Tattoo & Art Studio",
  description:
    "Apply for the Tattoo ProjectMembership Program waitlist at Fawcett Tattoo & Art Studio in Edmonton, Alberta.",
};

const tiers = [
  {
    name: "Starter Member",
    initial: "$500",
    monthly: "$150/month",
    minimum: "$2,000+",
    bestFor:
      "Clients beginning a larger tattoo project with a smaller monthly structure.",
  },
  {
    name: "Builder Member",
    initial: "$750",
    monthly: "$300/month",
    minimum: "$3,500+",
    bestFor:
      "Clients actively planning medium-to-large custom tattoo work with a median monthly structure.",
  },
  {
    name: "Commitment Member",
    initial: "$1,000",
    monthly: "$500/month",
    minimum: "$6,000+",
    bestFor:
      "Clients planning larger multi-session projects such as sleeves, leg projects, or back pieces with a higher monthly commitment.",
  },
];

export default function TattooProjectMembershipPage() {
  return (
    <main className="membership-page">
      <section className="membership-hero">
        <p className="eyebrow">Fawcett Tattoo & Art Studio</p>

        <h1>The Tattoo Project Membership Program</h1>

        <p className="hero-subtitle">
          A structured tattoo-project payment program for approved clients
          planning larger custom tattoo work.
        </p>

        <p>
          We are currently testing interest in a founding version of this
          program for clients who want to actively plan and complete a larger
          tattoo project within the next 12–36 months.
        </p>

        <p>
          This is not a discount, loan, investment, fundraiser, donation,
          ownership opportunity, or cash-return program. At this stage, we are
          collecting applications only. No payment is collected through this
          website form.
        </p>

        <div className="button-row">
          <a className="button button-primary" href="#apply">
            Apply for the Waitlist
          </a>

          <a className="button button-secondary" href="#tiers">
            View Tiers
          </a>

          <a className="button button-secondary" href="/portal/messages">
            Tattoo Portal Login
          </a>
        </div>
      </section>

      <section className="content-section">
        <h2>What it is</h2>
        <p>
          The Tattoo Project Membership Program is designed to help approved
          clients organize project planning, tattoo credit, booking
          expectations, and payment structure before starting a larger custom
          tattoo project.
        </p>

        <p>
          If accepted later, initial payments and monthly payments would build
          tattoo credit toward an approved tattoo project. Final project cost
          depends on the tattoo concept, artist, size, placement, complexity,
          skin, cover-up needs, design changes, session time, and written
          project estimate.
        </p>
      </section>

      <section className="content-section">
        <h2>Who it is for</h2>

        <ul className="check-list">
          <li>
            Clients planning a full sleeve, half sleeve, leg project, back
            piece, cover-up, or multi-session custom tattoo.
          </li>
          <li>
            Clients who are serious about planning a project within 12-36
            months.
          </li>
          <li>
            Clients who want a structured way to build tattoo credit toward an
            approved project.
          </li>
          <li>
            Clients who are comfortable following studio booking, health,
            preparation, and cancellation policies.
          </li>
        </ul>
      </section>

      <section className="content-section">
        <h2>How it works</h2>

        <div className="steps-grid">
          <div>
            <h3>1. Apply</h3>
            <p>
              Submit your tattoo idea, preferred artist, placement, timeline,
              and budget comfort level.
            </p>
          </div>

          <div>
            <h3>2. Review</h3>
            <p>
              We review your project for artist fit, timeline, size, complexity,
              and studio readiness.
            </p>
          </div>

          <div>
            <h3>3. Consult</h3>
            <p>
              If your project may be a fit, we may contact you through your
              client account for follow-up questions.
            </p>
          </div>

          <div>
            <h3>4. Terms later</h3>
            <p>
              No client is enrolled until written terms, estimate, payment
              schedule, and full mandatory costs are disclosed.
            </p>
          </div>
        </div>
      </section>

      <section id="tiers" className="content-section">
        <h2>Founding Member Interest Tiers</h2>

        <p>
          These tiers are not flat-rate tattoos, guaranteed packages, or
          discounts. They are planning and tattoo-credit structures for approved
          projects.
        </p>

        <div className="tier-grid">
          {tiers.map((tier) => (
            <article className="tier-card" key={tier.name}>
              <h3>{tier.name}</h3>

              <dl>
                <div>
                  <dt>Initial payment</dt>
                  <dd>{tier.initial}</dd>
                </div>

                <div>
                  <dt>Monthly payment</dt>
                  <dd>{tier.monthly}</dd>
                </div>

                <div>
                  <dt>Minimum project value</dt>
                  <dd>{tier.minimum}</dd>
                </div>
              </dl>

              <p>{tier.bestFor}</p>

              <a className="button button-small" href="#apply">
                Apply as a {tier.name}
              </a>
            </article>
          ))}
        </div>

        <p className="legal-note">
          All mandatory costs will be disclosed before enrollment, including
          tattoo time, supplies, GST, deposits, booking fees, drawing or design
          fees, payment-processing fees, and any other required costs.
        </p>
      </section>

      <section className="content-section transparency-box">
        <h2>Transparency First</h2>

        <p>
          This program is currently in the application and interest-testing
          stage. No payment is collected through this website form.
        </p>

        <p>
          Applying does not guarantee acceptance, enrollment, booking access,
          project approval, final pricing, priority placement, or a specific
          artist.
        </p>

        <p>
          Before enrollment, each approved client will receive written program
          terms, a project estimate, payment schedule, cancellation policy,
          refund &/or credit policy, and a full breakdown of all mandatory costs.
        </p>
      </section>

      <section id="apply" className="content-section">
        <h2>Apply for the Waitlist</h2>
        <p>
          Create a tattoo portal login first, then submit your project application.
          This keeps your project details, messages, and future tattoo portal
          data connected to your account.
        </p>

        <MembershipApplicationForm />
      </section>

      <section className="content-section faq-section">
        <h2>Frequently Asked Questions</h2>

        <details>
          <summary>Are these flat-rate tattoo prices?</summary>
          <p>
            No. These are not flat-rate tattoo prices or guaranteed tattoo
            packages. Final pricing depends on the approved project estimate.
          </p>
        </details>

        <details>
          <summary>Does applying guarantee acceptance?</summary>
          <p>
            No. Applications are reviewed based on project fit, artist
            availability, project readiness, timeline, health requirements, and
            studio policy.
          </p>
        </details>

        <details>
          <summary>Do the payments go toward my tattoo?</summary>
          <p>
            If accepted and enrolled later, initial payments and monthly
            payments would build tattoo credit toward your approved tattoo
            project.
          </p>
        </details>

        <details>
          <summary>Are there extra costs?</summary>
          <p>
            There may be required costs depending on the project. All mandatory
            costs will be disclosed in writing before enrollment.
          </p>
        </details>

        <details>
          <summary>Can I pay today?</summary>
          <p>
            No. The program is currently application-only. No payment is
            collected through this website form.
          </p>
        </details>
      </section>

      <section className="content-section">
        <Link className="button button-secondary" href="/">
          Back to Fawcett Tattoos
        </Link>
      </section>
    </main>
  );
}