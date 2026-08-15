import Link from "next/link";

export const metadata = {
  title: "Tattoo Aftercare",
  description:
    "Tattoo aftercare instructions for Fawcett Tattoos & Art Studio, including Tegaderm bandage care, washing, reapplying, long-term healing, touch-ups, and booking information.",
};

const bandageSteps = [
  {
    title: "1. Leave the first bandage on overnight",
    text: "We suggest leaving the 3M Tegaderm bandage applied by the studio on for 24 hours or overnight unless your artist gives you different instructions.",
  },
  {
    title: "2. Wash your hands first",
    text: "Before touching the bandage or tattoo, wash your hands thoroughly with unscented soap and warm water.",
  },
  {
    title: "3. Wash the outside of the bandage",
    text: "Gently wash the outside of the bandage before removing it so the area is clean before you expose the fresh tattoo wound.",
  },
  {
    title: "4. Remove the bandage slowly",
    text: "Peel the bandage off slowly. Push the skin near the bandage down and away while gently pulling the bandage in the opposite direction, up and away from the skin. Do not rip it off quickly.",
  },
  {
    title: "5. Wash the tattoo wound",
    text: "Use clean fingertips only and unscented soap. We suggest a gentle option like H2Ocean Foam Soap. Do not use washcloths, loofahs, towels, or anything abrasive.",
  },
  {
    title: "6. Let it dry fully",
    text: "After washing, let the tattoo air dry or gently pat it dry with a clean disposable paper towel. Make sure the tattoo and surrounding skin are completely dry before applying a new bandage.",
  },
  {
    title: "7. Apply a fresh clean bandage",
    text: "Apply a fresh, clean bandage over the tattoo. Keep this second bandage on for 7 days or 1 full week unless your artist tells you otherwise.",
  },
  {
    title: "8. Remove the second bandage after 1 week",
    text: "After 7 days, remove the second bandage using the same slow removal method: push the skin down and away while pulling the bandage up and away from the skin.",
  },
];

const afterBandageCare = [
  "Wash the tattoo gently with clean fingertips and unscented soap.",
  "Use only your fingertips to soften and remove any stuck adhesive residue.",
  "Do not scrub aggressively. Be patient and gentle.",
  "Pat dry with a clean disposable paper towel.",
  "Apply a thin layer of unscented lotion or cream. We suggest something like H2Ocean Care Cream.",
  "Use only a thin layer. The tattoo should not feel greasy, wet, or suffocated.",
];

const coolingSteps = [
  "Keep the bandage on unless your artist or a medical professional tells you to remove it.",
  "Wrap an ice pack or cold pack in a clean towel.",
  "Place it over the bandage for 5–10 minutes at a time.",
  "Take at least 20 minutes off between cooling sessions.",
  "Do not put ice directly on the tattoo or bare skin.",
  "Do not soak the bandage or let water sit under the film.",
];

const avoidList = [
  "Do not pick, scratch, or peel the tattoo.",
  "Do not soak in baths, hot tubs, pools, lakes, or rivers while healing.",
  "Do not tan or expose the tattoo to direct sun while healing.",
  "Do not use scented lotion, alcohol, peroxide, or harsh cleansers.",
  "Do not apply thick layers of ointment or cream.",
  "Do not wear tight, dirty, or abrasive clothing over the tattoo.",
  "Do not work out heavily if sweat, friction, or stretching will irritate the tattoo.",
];

const longTermCare = [
  "Once fully healed, keep the tattoo moisturized with a gentle unscented lotion.",
  "Use sunscreen on healed tattoos when exposed to sun.",
  "Avoid tanning beds if you want the tattoo to stay as bright and readable as possible.",
  "Color, contrast, and softness can change as the tattoo settles into the skin.",
  "Healing depends on skin, placement, immune response, aftercare, lifestyle, and sun exposure.",
  "Book a touch-up if the tattoo has faded, healed unevenly, or needs adjustments. We offer a free 1-hour touch-up within 1 year when the tattoo is eligible.",
];

const warningSigns = [
  "The tattoo feels increasingly hot, painful, swollen, or irritated.",
  "You see spreading redness, pus, severe rash, blisters, or unusual discharge.",
  "You feel feverish or unwell.",
  "The bandage causes hives, intense itching, burning, or a reaction around the adhesive.",
  "Fluid leaks out of the bandage, the bandage opens, or dirt/water gets trapped under it.",
];

export default function AftercarePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </Link>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Tattoo Aftercare
          </p>

          <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            How to care for your new tattoo.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
            These instructions are for tattoos bandaged by Fawcett Tattoos &
            Art Studio with a 3M Tegaderm-style film bandage. Follow your
            artist’s specific instructions if they gave you different guidance.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a className="button button-primary" href="#bandage-care">
              Bandage Steps
            </a>

            <a className="button button-secondary" href="#touch-ups">
              Touch-Up Policy
            </a>

            <Link className="button button-secondary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <div className="grid gap-5 md:grid-cols-3">
          <article className="rounded-[1.6rem] border border-[#0000cc]/60 bg-[#0000cc]/15 p-5 shadow-[0_0_35px_rgba(0,0,204,0.18)] md:p-7">
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">
              First Bandage
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white">
              24 hours / overnight
            </h2>

            <p className="mt-5 text-base font-semibold leading-8 text-white/72">
              Leave the bandage applied by the studio on overnight or for 24
              hours unless instructed otherwise.
            </p>
          </article>

          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              Second Bandage
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white">
              7 days / 1 week
            </h2>

            <p className="mt-5 text-base font-semibold leading-8 text-white/68">
              After cleaning and drying the tattoo, apply a fresh clean bandage
              and leave it on for 7 days.
            </p>
          </article>

          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              After Bandage
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white">
              Wash, dry, thin lotion
            </h2>

            <p className="mt-5 text-base font-semibold leading-8 text-white/68">
              Use clean fingertips, unscented soap, pat dry, then apply a thin
              layer of unscented lotion or care cream.
            </p>
          </article>
        </div>
      </section>

      <section
        id="bandage-care"
        className="scroll-mt-24 border-y border-white/10 bg-white/[0.02]"
      >
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Bandage Care
          </p>

          <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Tegaderm bandage instructions.
          </h2>

          <p className="mt-5 max-w-4xl text-base font-semibold leading-8 text-white/70">
            Your fresh tattoo is a wound. Keep everything clean, move slowly,
            and avoid touching the tattoo unless your hands are freshly washed.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {bandageSteps.map((step) => (
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
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              If it feels hot or humid
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Cool over the bandage.
            </h2>

            <p className="mt-5 text-base font-semibold leading-8 text-white/70">
              If the bandage feels hot, irritated, or humid underneath, you may
              cool the area over the bandage. Do not soak the bandage and do
              not place ice directly on the tattoo.
            </p>

            <ul className="mt-6 grid gap-3">
              {coolingSteps.map((step) => (
                <li
                  key={step}
                  className="text-base font-semibold leading-8 text-white/68"
                >
                  {step}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border border-red-400/25 bg-red-500/10 p-5 md:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-red-100/60">
              Contact us or seek medical advice
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Watch for warning signs.
            </h2>

            <p className="mt-5 text-base font-semibold leading-8 text-red-50/75">
              Some redness, tenderness, and fluid under the bandage can be
              normal early on. But worsening symptoms, allergic reactions, or
              signs of infection should be taken seriously.
            </p>

            <ul className="mt-6 grid gap-3">
              {warningSigns.map((sign) => (
                <li
                  key={sign}
                  className="text-base font-semibold leading-8 text-red-50/78"
                >
                  {sign}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              After Removing the Final Bandage
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Keep it clean and lightly moisturized.
            </h2>

            <ul className="mt-6 grid gap-3">
              {afterBandageCare.map((item) => (
                <li
                  key={item}
                  className="text-base font-semibold leading-8 text-white/68"
                >
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">
              Avoid While Healing
            </p>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Protect the tattoo while it settles.
            </h2>

            <ul className="mt-6 grid gap-3">
              {avoidList.map((item) => (
                <li
                  key={item}
                  className="text-base font-semibold leading-8 text-white/68"
                >
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        <article className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
            Long-Term Care
          </p>

          <h2 className="mt-4 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
            Good aftercare protects the healed result.
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {longTermCare.map((item) => (
              <div
                key={item}
                className="rounded-[1.3rem] border border-white/10 bg-black/35 p-5"
              >
                <p className="text-base font-semibold leading-8 text-white/68">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section
        id="touch-ups"
        className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-16 md:px-8"
      >
        <div className="grid gap-5 rounded-[2rem] border border-[#0000cc]/40 bg-[#0000cc]/15 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">
              Touch-Ups & Booking
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
              Need a touch-up or have a healing question?
            </h2>

            <p className="mt-4 max-w-4xl text-base font-semibold leading-8 text-white/72">
              We offer a free 1-hour touch-up within 1 year when the tattoo is
              eligible. Supply fees are not included. Touch-ups, refreshers,
              reworks, and healed checks must be reviewed by the studio before
              booking.
            </p>

            <p className="mt-4 max-w-4xl text-base font-semibold leading-8 text-white/72">
              To book, log in to the Tattoo Portal or start a consult and send
              clear healed photos in natural lighting, plus your name, tattoo
              date, artist, and what you are concerned about.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link className="button button-primary" href="/tattoo-portal">
              Tattoo Portal Login
            </Link>

            <Link className="button button-secondary" href="/consult">
              Start Free Consult
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}