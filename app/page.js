const CONTACT_EMAIL = "info@fawcetttattoos.com";
const CONTACT_PHONE = "+15874874985";
const INSTAGRAM_URL = "https://instagram.com/fawcetttattoos";
const POLICIES_URL = "/policies";

const services = [
  "Custom Tattoos",
  "Large-Scale Pieces",
  "Black & Grey",
  "Color Work",
  "Consultations",
  "Touch-Ups",
];

const artists = [
  {
    name: "Autumn Fawcett",
    image: "/artist-autumn.jpg",
    specialty:
      "Custom tattoo artist focused on high-impact work, strong flow on the body, and clean, intentional composition.",
    tags: ["Custom work", "Large-scale", "Bold design"],
  },
  {
    name: "Ben Fawcett",
    image: "/artist-matt.jpg",
    specialty:
      "Artist profile section for realism, subject matter, preferred projects, and booking focus. Replace this with his real bio and strongest niche.",
    tags: ["Realism", "Black & grey", "Large projects"],
  },
];

const portfolioItems = [
  { image: "/tattoo-1.png", title: "Large-Scale Black & Grey", type: "Sleeve Work" },
  { image: "/tattoo-2.png", title: "Custom Composition", type: "Custom Project" },
  { image: "/tattoo-3.png", title: "Healed Detail", type: "Healed Work" },
  { image: "/tattoo-4.png", title: "Bold Placement Flow", type: "Body Flow" },
  { image: "/tattoo-5.png", title: "High Contrast Design", type: "Fresh Work" },
  { image: "/tattoo-6.png", title: "Statement Piece", type: "Featured Work" },
];

const faqs = [
  {
    question: "How do I book?",
    answer:
      "Start with a consultation request by email or through the booking section below. Include your idea, placement, approximate size, style direction, and reference images so we can review your project properly.",
  },
  {
    question: "Do you require a deposit?",
    answer:
      "Yes. A non-refundable deposit is required to secure an appointment and goes toward the tattoo session, subject to studio booking policies.",
  },
  {
    question: "What should I include in my booking request?",
    answer:
      "Send the concept, placement, size in inches, black and grey or color preference, any reference images, and whether you are open to artist direction.",
  },
  {
    question: "What is the reschedule policy?",
    answer:
      "Reschedules should be requested with as much notice as possible. Last-minute cancellations or no-shows may result in deposit loss according to studio policy.",
  },
  {
    question: "How do I prepare for my appointment?",
    answer:
      "Eat beforehand, stay hydrated, avoid alcohol, arrive rested, and wear clothing that gives easy access to the tattoo area.",
  },
  {
    question: "Do you provide aftercare instructions?",
    answer:
      "Yes. Aftercare instructions are provided after your appointment so your tattoo heals properly and holds the best result possible.",
  },
];

const bookingSteps = [
  {
    number: "01",
    title: "Send your idea",
    text: "Tell us the concept, placement, size, style, and attach reference images.",
  },
  {
    number: "02",
    title: "Review and consultation",
    text: "We review the project, discuss fit, and confirm the right artist and appointment path.",
  },
  {
    number: "03",
    title: "Secure with deposit",
    text: "Once approved, your appointment is locked in with a deposit under studio policy.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
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
            <a href="#booking" className="text-sm text-white/70 transition hover:text-white">
              Booking
            </a>
            <a href="#faq" className="text-sm text-white/70 transition hover:text-white">
              FAQ
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Tattoo Consultation Request`}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
            >
              Contact
            </a>
          </nav>
        </div>
      </header>

      <section id="top" className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <p className="mb-5 text-[11px] uppercase tracking-[0.38em] text-white/45 md:text-xs">
              Edmonton Tattoo Studio
            </p>

            <h1 className="max-w-4xl text-[3.3rem] font-black leading-[0.95] tracking-tight sm:text-[4.5rem] md:text-7xl">
              Fawcett Tattoos
              <span className="mt-1 block text-white/65">& Art Studio</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70 md:text-xl">
              Custom tattooing, strong design, clean execution, and studio work built to hold up over time.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Tattoo Consultation Request`}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
              >
                Book a Consultation
              </a>

              <a
                href="#portfolio"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Portfolio
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-white/45">
              <span className="rounded-full border border-white/10 px-3 py-2">Custom Work</span>
              <span className="rounded-full border border-white/10 px-3 py-2">Consultations</span>
              <span className="rounded-full border border-white/10 px-3 py-2">Edmonton, Alberta</span>
            </div>

            <div className="mt-10 space-y-2 text-sm leading-7 text-white/55 md:text-base">
              <p>15060 132 Street NW</p>
              <p>Edmonton, Alberta T6V 1K8</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
            <img
              src="/hero-studio.jpg"
              alt="Fawcett Tattoos studio"
              className="h-[420px] w-full object-cover md:h-[560px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Custom-first approach", "Projects are built around idea, placement, and long-term body flow."],
            ["Professional process", "Consultation, deposit, scheduling, and expectations are clearly handled."],
            ["Portfolio-driven", "The work leads. Strong imagery and clear specialty sell better than fluff."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">Services</p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">Focused, simple, and built to convert</h2>
            <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
              Version one should feel sharp and premium. It does not need to be crowded.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div
                key={service}
                className="rounded-[1.5rem] border border-white/10 bg-black p-5 text-lg font-medium text-white/85"
              >
                {service}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="artists" className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">Artists</p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">Meet the studio</h2>
          <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
            Strong artist positioning builds trust faster than generic bios.
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
              <h2 className="mt-3 text-3xl font-black md:text-5xl">Show the strongest work first</h2>
              <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
                Lead with your best pieces. Strong healed work, strong composition, and strong lighting.
              </p>
            </div>

            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Tattoo Consultation Request`}
              className="text-sm font-semibold text-white/75 underline underline-offset-4"
            >
              Start a booking request
            </a>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioItems.map((item, index) => (
              <article
                key={item.image}
                className={`${index === 0 ? "sm:col-span-2" : ""} overflow-hidden rounded-[1.75rem] border border-white/10 bg-black`}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className={`${index === 0 ? "h-[420px]" : "h-[320px]"} w-full object-cover transition duration-300 hover:scale-[1.03]`}
                />
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">{item.type}</p>
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
            <h2 className="mt-3 text-3xl font-black md:text-5xl">A clear process gets more inquiries</h2>
            <p className="mt-4 text-base leading-8 text-white/65 md:text-lg">
              Make it obvious what clients need to send and what happens next.
            </p>

            <div className="mt-8 space-y-4">
              {bookingSteps.map((step) => (
                <div key={step.number} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">{step.number}</p>
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
                  <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p>
                  Phone:{" "}
                  <a href={`tel:${CONTACT_PHONE}`} className="underline underline-offset-4">
                    {CONTACT_PHONE}
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
            <h3 className="text-2xl font-bold">Start your tattoo request</h3>
            <p className="mt-3 text-base leading-8 text-white/65">
              For now, the fastest working version is direct contact. That beats a fake form every time.
            </p>

            <div className="mt-8 grid gap-4">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Tattoo Consultation Request`}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-4 text-sm font-bold text-black transition hover:scale-[1.01]"
              >
                Email to Book
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

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black p-5">
              <p className="text-sm font-semibold text-white">What to send with your inquiry</p>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-white/65">
                <li>Concept or subject matter</li>
                <li>Placement on the body</li>
                <li>Approximate size in inches</li>
                <li>Black and grey, color, or open to artist direction</li>
                <li>3–6 reference images if you have them</li>
              </ul>
            </div>

            <div className="mt-6">
              <a
                href={POLICIES_URL}
                className="text-sm font-semibold text-white/75 underline underline-offset-4"
              >
                View booking policies
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">Policies</p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">Booking info clients actually need</h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Deposits", "Appointments are secured with a non-refundable deposit applied to the session."],
              ["Reschedules", "Reschedule notice should be given as early as possible to avoid deposit loss."],
              ["Prep & aftercare", "Clients receive prep expectations before the appointment and aftercare instructions afterward."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-[1.5rem] border border-white/10 bg-black p-6">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/65">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-18">
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
            <a href="#booking" className="hover:text-white">
              Booking
            </a>
            <a href={POLICIES_URL} className="hover:text-white">
              Policies
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}