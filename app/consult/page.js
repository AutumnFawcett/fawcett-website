import Link from "next/link";
import ConsultRequestForm from "@/components/ConsultRequestForm";

export const metadata = {
  title: "Start a Tattoo Consult",
  description:
    "Start a tattoo consult with Fawcett Tattoos & Art Studio through the Tattoo Portal. Share your idea, placement, style, budget, and project goals.",
};

const consultOptions = [
  {
    title: "Tattoo Portal Consult",
    price: "Free",
    description:
      "Best first step for most tattoo ideas. Submit your concept, placement, budget, style direction, and timeline through the Tattoo Portal.",
  },
  {
    title: "In-Person Consult",
    price: "$25 / 30 min",
    description:
      "For clients who need an in-studio conversation about placement, sizing, project planning, or next steps.",
  },
  {
    title: "Consult + Spot Test",
    price: "$75",
    description:
      "For clients who want an in-person consult with an allergy or spot test before moving forward.",
  },
];

const whatToInclude = [
  "Your tattoo idea or subject matter",
  "Placement and approximate size",
  "Black and grey, color, realism, illustrative, cover-up, or other style direction",
  "Any reference images or inspiration links",
  "Budget range and timeline",
  "Health, allergy, skin, or cover-up details that may affect the project",
];

export default function ConsultPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Tattoo Consult
          </p>

          <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            Start your tattoo request.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
            Tell us about your tattoo idea, placement, size, style direction,
            timeline, and budget. We will review your request and reply through
            the Tattoo Portal.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a className="button button-primary" href="#consult-form">
              Start Free Consult
            </a>

            <Link className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>

            <Link className="button button-secondary" href="/pricing">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {consultOptions.map((option) => (
            <article
              key={option.title}
              className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <h2 className="min-w-0 text-2xl font-black leading-[1.05] tracking-[-0.04em] text-white md:text-[1.7rem] xl:text-3xl">
                  {option.title}
                </h2>

                <p className="shrink-0 rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-base font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)] md:text-lg">
                  {option.price}
                </p>
              </div>

              <p className="mt-5 text-base font-semibold leading-8 text-white/68">
                {option.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <div className="grid gap-5 rounded-[2rem] border border-[#0000cc]/40 bg-[#0000cc]/15 p-5 md:grid-cols-[0.75fr_1fr] md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">
              What to include
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Better details help us give better next steps.
            </h2>
          </div>

          <ul className="grid gap-3">
            {whatToInclude.map((item) => (
              <li
                key={item}
                className="text-base font-semibold leading-8 text-white/72"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="consult-form"
        className="mx-auto max-w-5xl scroll-mt-24 px-5 pb-16 md:px-8"
      >
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Free Tattoo Portal Consult
          </p>

          <h2 className="mt-4 max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Submit your request.
          </h2>

          <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/70">
            This form creates or uses your Tattoo Portal account so we can keep
            your request, messages, project notes, appointments, and updates
            organized in one place.
          </p>

          <div className="mt-8">
            <ConsultRequestForm />
          </div>
        </div>
      </section>
    </main>
  );
}