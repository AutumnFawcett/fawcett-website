import ConsultRequestForm from "@/components/ConsultRequestForm";

export const metadata = {
  title: "Book a Tattoo Consult | Fawcett Tattoos & Art Studio",
};

export default function ConsultPage() {
  return (
    <main className="consult-page">
      <section className="consult-hero">
        <p className="eyebrow">Tattoo Consult</p>

        <h1>Start a Tattoo Request</h1>

        <p>
          Tell us about your tattoo idea, placement, size, style direction, and
          availability. We will review your request and reply through your client
          message portal.
        </p>

        <div className="button-row">
          <a className="button button-secondary" href="/portal/messages">
            Tattoo Portal Login
          </a>

          <a className="button button-secondary" href="/tattoo-project-membership">
            Project Membership
          </a>
        </div>
      </section>

      <ConsultRequestForm />
    </main>
  );
}