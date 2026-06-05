export default function AftercarePage() {
  const sections = [
    {
      title: "First 24 Hours",
      bullets: [
        "Keep the tattoo bandaged for the time recommended by your artist.",
        "Wash your hands before touching the tattoo or bandage.",
        "Remove the bandage carefully.",
        "Wash the tattoo gently with the recommended soap using clean hands only.",
        "Pat dry with a clean towel or disposable paper towel. Do not rub.",
      ],
    },
    {
      title: "First Week",
      bullets: [
        "Keep the tattoo clean and protected.",
        "Do not submerge the tattoo in baths, hot tubs, lakes, pools, or other bodies of water.",
        "Avoid heavy sweating, friction, tight abrasive clothing, and unnecessary irritation.",
        "Follow your artist’s bandage and product instructions exactly.",
      ],
    },
    {
      title: "First Month",
      bullets: [
        "Continue washing and moisturizing as directed.",
        "Use only the recommended aftercare products or approved alternatives.",
        "Do not pick, scratch, or overwork the area while healing.",
        "Stay hydrated, rest well, and support healing with good general care.",
      ],
    },
    {
      title: "Long-Term Care",
      bullets: [
        "Moisturize regularly.",
        "Protect the tattoo from sun exposure.",
        "Use sunscreen once fully healed.",
        "Book touch-ups as needed over time.",
      ],
    },
    {
      title: "When to Get Medical Help",
      bullets: [
        "Seek medical attention if you notice worsening redness, increasing pain, severe swelling, pus, strong odor, fever, or other signs of infection.",
        "The studio cannot diagnose infection or replace medical advice.",
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
          <a href="/" className="text-sm text-white/60 hover:text-white">
            ← Back to Home
          </a>

          <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
            Tattoo Aftercare
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">
            Proper aftercare protects your healing and your final result.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Proper aftercare is critical to healing, comfort, and long-term tattoo
            quality. Please follow your artist’s instructions closely.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-8 text-white/55">
            Free touch-up eligibility may be affected if studio aftercare
            instructions are not followed.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-18">
        <div className="grid gap-6">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8"
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