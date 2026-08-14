const CONTACT_EMAIL =
  "mailto:info@fawcetttattoos.com?subject=Tattoo Consultation Request&body=Name:%0APhone Number:%0ATattoo Idea:%0APlacement:%0AApproximate Size:%0ABlack and Grey or Color:%0AReference Images:%0APreferred Artist:%0A";
const CONTACT_EMAIL_TEXT = "info@fawcetttattoos.com";
const CONTACT_PHONE = "15874874985";
const CONTACT_PHONE_DISPLAY = "(587) 487-4985";
const INSTAGRAM_URL = "https://instagram.com/fawcetttattoos";

const artists = [
  {
    name: "Autumn Fawcett",
    image: "/artist-autumn.png",
    specialty:
      "Custom tattoo artist focused on bold composition, strong body flow, and high-impact pieces built to heal clean and hold up over time.",
    tags: ["Realism", "Abstract", "Full Color", "Black & Grey", "Large-scale"],
  },
  {
    name: "Ben Fawcett",
    image: "/artist-ben.png",
    specialty:
      "Tattoo artist focused on realism-driven custom work, strong contrast, and large-scale projects designed for flow, readability, and long-term impact.",
    tags: ["Realism","Portrait", "Black & Grey", "Full Color", "Large projects"],
  },
];

const portfolioItems = [
  { image: "/tattoo-1.png", title: "Black & Grey Sleeve", type: "Large-Scale Work" },
  { image: "/tattoo-2.png", title: "Custom Composition", type: "Custom Project" },
  { image: "/tattoo-3.png", title: "Healed Detail", type: "Healed Work" },
  { image: "/tattoo-4.png", title: "Strong Placement Flow", type: "Body Flow" },
  { image: "/tattoo-5.png", title: "High Contrast Piece", type: "Fresh Work" },
  { image: "/tattoo-6.png", title: "Featured Tattoo", type: "Portfolio Select" },
];

const faqs = [
  {
    question: "How do I book?",
    answer:
      "Start with a consultation request by email, phone, or direct message. Include your idea, placement, approximate size, preferred style, and any reference images so we can review your project properly.",
  },
  {
    question: "Do you require a deposit?",
    answer:
      "Yes. A non-refundable, non-transferable booking fee is required to secure all tattoo and PMU appointments.",
  },
  {
    question: "What should I include in my inquiry?",
    answer:
      "Please include the concept, body placement, approximate size, black and grey or color preference, and 3–6 reference images if available.",
  },
  {
    question: "Do you offer consultations?",
    answer:
      "Yes. We offer virtual and in-person consultations depending on the needs of the project.",
  },
  {
    question: "Do you provide aftercare instructions?",
    answer:
      "Yes. Aftercare guidance is provided after your appointment, and we strongly recommend following studio aftercare instructions closely for the best healing results.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="credit-marquee" aria-label="Tattoo credit announcement">
        <a href="/tattoo-project-membership" className="credit-marquee-track">
          <div className="credit-marquee-content">
            <span>Interested in Tattoo Credit?</span>
            <span>Apply for the Tattoo Credit Waitlist</span>
            <span>Piece • Collector • Sleeve</span>
            <span>Build tattoo credit toward an approved project</span>
          </div>

          <div className="credit-marquee-content">
            <span>Interested in Tattoo Credit?</span>
            <span>Apply for the Tattoo Credit Waitlist</span>
            <span>Piece • Collector • Sleeve</span>
            <span>Build tattoo credit toward an approved project</span>
          </div>
        </a>
      </section>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 md:px-8">
          <div className="flex items-center justify-between">
            <a href="#top" className="text-base font-black tracking-[0.16em] md:text-lg">
              FAWCETT TATTOOS
            </a>

            <nav className="hidden items-center gap-6 md:flex">
              <a href="#artists" className="text-sm text-white/70 transition hover:text-white">
                Artists
              </a>
              <a href="#portfolio" className="text-sm text-white/70 transition hover:text-white">
                Portfolio
              </a>
              <a href="/pricing" className="text-sm text-white/70 transition hover:text-white">
                Pricing
              </a>
              <a href="/policies" className="text-sm text-white/70 transition hover:text-white">
                Policies
              </a>
              <a href="/aftercare" className="text-sm text-white/70 transition hover:text-white">
                Aftercare
              </a>
              <a href="/tattoo-portal" className="text-sm text-white/70 transition hover:text-white">
                Tattoo Portal
              </a>
              <a
                href={CONTACT_EMAIL}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Contact
              </a>
            </nav>
          </div>

          <nav className="mt-3 flex flex-wrap gap-4 text-sm md:hidden">
            <a href="#artists" className="text-white/70 hover:text-white">
              Artists
            </a>
            <a href="#portfolio" className="text-white/70 hover:text-white">
              Portfolio
            </a>
            <a href="/pricing" className="text-white/70 hover:text-white">
              Pricing
            </a>
            <a href="/policies" className="text-white/70 hover:text-white">
              Policies
            </a>
            <a href="/aftercare" className="text-white/70 hover:text-white">
              Aftercare
            </a>
          </nav>
        </div>
      </header>


      <section id="top" className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.35em] text-white/45 md:text-xs">
              Edmonton Tattoo Studio
            </p>

            <h1 className="max-w-4xl text-[3.1rem] font-black leading-[0.95] tracking-tight sm:text-[4.4rem] md:text-7xl">
              Custom tattoos with bold design, strong flow, and clean execution.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70 md:text-xl">
              Fawcett Tattoos & Art Studio creates custom black and grey, color,
              realism-driven, and large-scale tattoo work in Edmonton, Alberta.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                  href="/consult"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
                >
                  Start a Consultation
              </a>

              <a className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-white/45">
              <span className="rounded-full border border-white/10 px-3 py-2">
                Custom Consultations
              </span>
              <span className="rounded-full border border-white/10 px-3 py-2">
                Large-Scale Projects Welcome
              </span>
              <span className="rounded-full border border-white/10 px-3 py-2">
                Edmonton, Alberta
              </span>
            </div>

            <div className="mt-10 space-y-2 text-sm leading-7 text-white/55 md:text-base">
              <p>15060 132 Street NW</p>
              <p>Edmonton, Alberta T6V 1K8</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
            <img
              src="/hero-studio.png"
              alt="Fawcett Tattoo studio"
              className="h-[420px] w-full object-cover md:h-[560px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          </div>
        </div>
      </section>


      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              "Custom-first approach",
              "Every project is built around idea, placement, and long-term body flow.",
            ],
            [
              "Professional booking process",
              "Consultation, deposit, scheduling, and expectations are handled clearly.",
            ],
            [
              "Portfolio-driven work",
              "Strong imagery, healed results, and readable design matter more than hype.",
            ],
          ].map(([title, text]) => (
            <div
              key={title}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6"
            >
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">{text}</p>
            </div>
          ))}
        </div>
      </section>

<section id="membership" className="section membership-preview-section">
    <div className="membership-preview-card">
  <div className="section-heading">
    <p className="eyebrow">INTERESTED IN TATTOO CREDIT?</p>
  </div>

      <div>

      <p>
        The Tattoo Project Membership Program is being designed for approved
        clients who want to build tattoo credit toward a larger custom project
        over time.
      </p>

    </div>

    <a className="button button-primary" href="/tattoo-project-membership">
      Apply for the Waitlist
    </a>
  </div>
</section>
 

      <section id="artists" className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">Artists</p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">Meet the studio</h2>
          <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
            We focus on strong design, readable composition, and tattoos built to heal
            clean and hold up over time.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {artists.map((artist) => (
            <article
              key={artist.name}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]"
            >
              <img
                src={artist.image}
                alt={artist.name}
                className="h-80 w-full object-cover md:h-[420px]"
              />

              <div className="p-6 md:p-8">
                <h3 className="text-2xl font-bold md:text-3xl">{artist.name}</h3>
                <p className="mt-4 text-base leading-8 text-white/65">{artist.specialty}</p>

                <div className="mt-5 flex flex-wrap gap-3">
                  {artist.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/55"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>



      <section id="portfolio" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">Portfolio</p>
              <h2 className="mt-3 text-3xl font-black md:text-5xl">Recent work</h2>
              <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
                Our portfolio includes custom work, large-scale projects,
                realism-driven pieces, and healed results.
              </p>
            </div>

            <a
              href={CONTACT_EMAIL}
              className="text-sm font-semibold text-white/75 underline underline-offset-4"
            >
              Start a booking request
            </a>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioItems.map((item, index) => (
              <article
                key={item.image}
                className={`${
                  index === 0 ? "sm:col-span-2" : ""
                } overflow-hidden rounded-[1.75rem] border border-white/10 bg-black`}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className={`${
                    index === 0 ? "h-[420px]" : "h-[320px]"
                  } w-full object-cover transition duration-300 hover:scale-[1.03]`}
                />
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                    {item.type}
                  </p>
                  <h3 className="mt-2 text-xl font-bold">{item.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="booking" className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">Booking</p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">Start your tattoo request</h2>
            <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
              Send us your idea, placement, approximate size, style direction, and
              any reference images. We will review your project and recommend the
              best appointment path.
            </p>

            <div className="mt-8 space-y-4">
              {[
                {
                  number: "01",
                  title: "Send your idea",
                  text: "Tell us the concept, placement, size, style, and attach reference images.",
                },
                {
                  number: "02",
                  title: "Project review",
                  text: "We review the idea, discuss fit, and recommend the right artist and appointment structure.",
                },
                {
                  number: "03",
                  title: "Secure your booking",
                  text: "Once approved, your appointment is secured with a booking fee under studio policy.",
                },
              ].map((step) => (
                <div
                  key={step.number}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    {step.number}
                  </p>
                  <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-white/65">{step.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-lg font-bold">Contact</h3>
              <div className="mt-4 space-y-3 text-sm text-white/70">
                <p>
                  Email:{" "}
                  <a href={CONTACT_EMAIL} className="underline underline-offset-4">
                    {CONTACT_EMAIL_TEXT}
                  </a>
                </p>
                <p>
                  Phone:{" "}
                  <a
                    href={`tel:${CONTACT_PHONE}`}
                    className="underline underline-offset-4"
                  >
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                </p>
                <p>
                  Instagram:{" "}
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    @fawcetttattoos
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <h3 className="text-2xl font-bold">What to send with your inquiry</h3>
            <p className="mt-3 text-base leading-8 text-white/65">
              The more details you provide, the faster we can review your request.
            </p>

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black p-5">
              <ul className="space-y-3 text-sm leading-7 text-white/65">
                <li>Concept or subject matter</li>
                <li>Placement on the body</li>
                <li>Approximate size in inches</li>
                <li>Black and grey or color preference</li>
                <li>3–6 reference images if you have them</li>
                <li>Preferred artist if applicable</li>
              </ul>
            </div>

            <div className="mt-8 grid gap-4">
              <a
                href={CONTACT_EMAIL}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
              >
                Book a Consultation
              </a>

              <a
                href={`tel:${CONTACT_PHONE}`}
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Call the Studio
              </a>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                DM on Instagram
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              <a href="/pricing" className="text-white/75 underline underline-offset-4">
                View pricing
              </a>
              <a href="/policies" className="text-white/75 underline underline-offset-4">
                View policies
              </a>
              <a href="/aftercare" className="text-white/75 underline underline-offset-4">
                View aftercare
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">FAQ</p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">Booking basics</h2>
          </div>

          <div className="mt-10 grid gap-4">
            {faqs.map((item) => (
              <div
                key={item.question}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6 md:p-7"
              >
                <h3 className="text-lg font-bold md:text-xl">{item.question}</h3>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-white/65 md:text-base md:leading-8">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-white/45 md:flex-row md:items-center md:justify-between md:px-8">
          <p>© 2026 Fawcett Tattoos & Art Studio</p>

          <div className="flex flex-wrap gap-4">
            <a href="#artists" className="hover:text-white">
              Artists
            </a>
            <a href="#portfolio" className="hover:text-white">
              Portfolio
            </a>
            <a href="/pricing" className="hover:text-white">
              Pricing
            </a>
            <a href="/policies" className="hover:text-white">
              Policies
            </a>
            <a href="/aftercare" className="hover:text-white">
              Aftercare
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}