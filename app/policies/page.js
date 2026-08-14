import Link from "next/link";

export default function PoliciesPage() {
  const sections = [
    {
      title: "General Booking Rules",
      bullets: [
        "Clients must be 18+ to book and receive tattoo services.",
        "A booking fee is required for all tattoo and PMU appointments.",
        "Consultation fees and design fees are separate from booking fees.",
        "Consultation fees and design fees do not come off the tattoo price unless explicitly stated.",
        "Pre-payments and paid-in-full appointments are treated as booking fees and follow the same policy.",
      ],
    },
    {
      title: "Deposits",
      bullets: [
        "Booking fees are non-refundable and non-transferable.",
        "Deposit amounts vary depending on the service, project size, and time being reserved.",
        "A minimum deposit may be required for all tattoo and PMU services.",
        "Larger deposits may be required for sleeve, back piece, or full-session bookings.",
      ],
    },
    {
      title: "Rescheduling & Cancellations",
      bullets: [
        "At least 72 hours notice is required for cancellations or rescheduling.",
        "Rescheduling requests inside 72 hours may require a new deposit.",
        "Repeated rescheduling, late cancellations, or failure to rebook may result in larger deposits or refusal of future booking.",
        "Deposits may be partially or fully forfeited if policy is violated.",
      ],
    },
    {
      title: "Tardiness & No-Shows",
      bullets: [
        "Please give at least 1 hour notice if you will be late.",
        "Late arrival without notice may result in late fees, loss of appointment time, or cancellation.",
        "A no-show may result in loss of the full booking fee and refusal of future booking.",
      ],
    },
    {
      title: "Appointment Conduct",
      bullets: [
        "Do not arrive intoxicated or under the influence of alcohol or drugs.",
        "Do not bring a guest without prior approval.",
        "Disrespectful, abusive, or disruptive behaviour may result in immediate cancellation of the appointment and loss of deposit.",
        "The artist reserves the right to refuse service at any time.",
      ],
    },
    {
      title: "Payments",
      bullets: [
        "Full payment is due as agreed for the tattoo session.",
        "Unpaid balances may be subject to additional collection action if left unresolved.",
      ],
    },
    {
      title: "Large Project Policies",
      bullets: [
        "Sleeve and large-project packages require ongoing scheduling commitment.",
        "Missed scheduling timelines may result in package pricing being removed and standard pricing being applied.",
        "Package deposits roll according to project terms only when studio policy has been followed.",
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Booking & Deposit Policy
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">
            Clear expectations protect both the client and the artist.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            A booking fee is required to secure all tattoo and PMU appointments.
            Deposit amounts vary based on the service, project size, and time being
            reserved.
          </p>
          <p className="mt-4 text-lg font-semibold text-white">
            Booking fees are non-refundable and non-transferable.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-18">
        <div className="grid gap-6">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-4xl border border-white/10 bg-white/3 p-6 md:p-8"
            >
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <ul className="mt-5 space-y-3 text-white/70">
                {section.bullets.map((item) => (
                  <li key={item} className="leading-7">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}