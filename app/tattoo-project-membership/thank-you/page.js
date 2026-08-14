import Link from "next/link";

export const metadata = {
  title: "Application Received | Fawcett Tattoos & Art Studio",
};

export default function MembershipThankYouPage() {
  return (
    <main className="membership-page">
      <section className="membership-hero">
        <p className="eyebrow">Application Received</p>

        <h1>Thank you for applying.</h1>

        <p className="hero-subtitle">
          Your Tattoo Project Membership Program waitlist application has been
          submitted.
        </p>

        <p>
          We will review your project details and contact you if your project
          may be a good fit.
        </p>

        <p>
          Submitting this form does not guarantee acceptance, booking access,
          project approval, final pricing, or enrollment. No payment has been
          collected.
        </p>

         <div className="button-row">
            <Link className="button button-primary" href="/portal/messages">
                View Client Messages
            </Link>

            <Link className="button button-secondary" href="/">
                Return to Website
            </Link>

            <Link className="button button-primary" href="/portal/dashboard">
              Go to Client Dashboard
            </Link>

            <Link
                className="button button-secondary"
                href="/tattoo-project-membership"
            >
                Back to Program Page
            </Link>
        </div>
      </section>
    </main>
  );
}