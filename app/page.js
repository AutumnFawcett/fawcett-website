const services = [
  "Custom Tattoos",
  "Consultations",
  "Flash Designs",
  "Large-Scale Pieces",
  "Touch-Ups",
  "Studio Art Projects",
];

const portfolioImages = [
  "/tattoo-1.png",
  "/tattoo-2.png",
  "/tattoo-3.png",
  "/tattoo-4.png",
  "/tattoo-5.png",
  "/tattoo-6.png",
];

const faqs = [
  {
    question: "How do I book?",
    answer:
      "Send a booking request with your idea, placement, size, style, and any reference images. The more clear you are, the faster the consultation process goes.",
  },
  {
    question: "Do you require a deposit?",
    answer:
      "Yes. Appointments are secured with a non-refundable deposit that goes toward your tattoo appointment, subject to studio booking policies.",
  },
  {
    question: "Where are you located?",
    answer:
      "Fawcett Tattoos & Art Studio is located at 15060 132 Street NW, Edmonton, Alberta, T6V 1K8.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#top" className="text-lg font-black tracking-wide">
            FAWCETT TATTOOS
          </a>

          <nav className="hidden gap-6 md:flex">
            <a href="#services" className="text-sm text-white/75 hover:text-white">
              Services
            </a>
            <a href="#artists" className="text-sm text-white/75 hover:text-white">
              Artists
            </a>
            <a href="#portfolio" className="text-sm text-white/75 hover:text-white">
              Portfolio
            </a>
            <a href="#booking" className="text-sm text-white/75 hover:text-white">
              Booking
            </a>
          </nav>
        </div>
      </header>

      <section id="top" className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:px-10 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/50">
              Edmonton Tattoo Studio
            </p>

            <h1 className="text-5xl font-black leading-tight md:text-7xl">
              Fawcett Tattoos
              <span className="block text-white/70">& Art Studio</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-white/70">
              Custom tattooing, bold artistic work, and a professional studio
              experience built around strong design, clean execution, and work
              that lasts.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#booking"
                className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                Book a Consultation
              </a>

              <a
                href="#portfolio"
                className="rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Portfolio
              </a>
            </div>

            <div className="mt-10 text-sm text-white/60">
              <p>15060 132 Street NW</p>
              <p>Edmonton, Alberta T6V 1K8</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
            <img
              src="/hero-studio.jpg"
              alt="Fawcett Tattoos studio"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-7xl px-6 py-16 md:px-10">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Services
          </p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">
            Built to convert visitors into bookings
          </h2>
          <p className="mt-4 text-white/70">
            Keep version one simple. You do not need twenty pages. You need a
            strong first impression, real work, and a clear booking path.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service}
              className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-lg font-medium"
            >
              {service}
            </div>
          ))}
        </div>
      </section>

      <section
        id="artists"
        className="border-y border-white/10 bg-white/[0.03]"
      >
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">
              Artists
            </p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">
              Meet the studio
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <img
                src="/artist-autumn.jpg"
                alt="Autumn Fawcett"
                className="h-80 w-full rounded-[1.5rem] object-cover"
              />
              <h3 className="mt-5 text-2xl font-bold">Autumn Fawcett</h3>
              <p className="mt-3 text-white/70">
                Custom tattoo artist focused on high-impact work, bold design,
                and pieces built for strong visual flow on the body.
              </p>
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <img
                src="/artist-matt.jpg"
                alt="Resident artist"
                className="h-80 w-full rounded-[1.5rem] object-cover"
              />
              <h3 className="mt-5 text-2xl font-bold">Artist Profile</h3>
              <p className="mt-3 text-white/70">
                Add your second artist bio here with specialty, style, booking
                details, and strongest niche.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="portfolio" className="mx-auto max-w-7xl px-6 py-16 md:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">
              Portfolio
            </p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">
              Show the work. That is what sells.
            </h2>
            <p className="mt-4 text-white/70">
              Use your strongest 6 to 9 images first. Fresh work, healed work,
              clean lighting, no clutter.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolioImages.map((image, index) => (
            <div
              key={image}
              className="overflow-hidden rounded-[1.75rem] border border-white/10"
            >
              <img
                src={image}
                alt={`Tattoo portfolio ${index + 1}`}
                className="aspect-square w-full object-cover transition duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </section>

      <section
        id="booking"
        className="border-y border-white/10 bg-white/[0.03]"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 md:px-10 lg:grid-cols-2">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">
              Booking
            </p>
            <h2 className="mt-3 text-3xl font-black md:text-5xl">
              Start your tattoo request
            </h2>
            <p className="mt-4 text-white/70">
              For launch, this can be a form, email button, booking platform
              link, or Instagram inquiry button. Simple is fine.
            </p>

            <div className="mt-8 space-y-2 text-white/70">
              <p>Fawcett Tattoos & Art Studio</p>
              <p>15060 132 Street NW</p>
              <p>Edmonton, Alberta T6V 1K8</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-neutral-900 p-6">
            <form className="grid gap-4">
              <input
                type="text"
                placeholder="Full Name"
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
              <input
                type="email"
                placeholder="Email"
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
              <input
                type="text"
                placeholder="Phone Number"
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
              <textarea
                placeholder="Describe your tattoo idea, placement, size, and style."
                className="min-h-[160px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
              />
              <button
                type="button"
                className="rounded-2xl bg-white px-6 py-3 font-semibold text-black transition hover:scale-[1.01]"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-black md:text-5xl">
            Booking basics
          </h2>
        </div>

        <div className="mt-10 grid gap-4">
          {faqs.map((item) => (
            <div
              key={item.question}
              className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6"
            >
              <h3 className="text-lg font-bold">{item.question}</h3>
              <p className="mt-3 text-white/70">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-white/55 md:flex-row md:items-center md:justify-between md:px-10">
          <p>© 2026 Fawcett Tattoos & Art Studio</p>

          <div className="flex gap-4">
            <a href="#services" className="hover:text-white">
              Services
            </a>
            <a href="#portfolio" className="hover:text-white">
              Portfolio
            </a>
            <a href="#booking" className="hover:text-white">
              Booking
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}