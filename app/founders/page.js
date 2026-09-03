import ProgressMeter from "@/components/ProgressMeter";
import RewardTierCard from "@/components/RewardTierCard";
import { foundersCampaign, formatCampaignCurrency } from "@/lib/foundersCampaign";
import Link from "next/link";

export const metadata = {
  title: "Fawcett Founders — Private Preview",
  description: "A private preview of the Fawcett Founders campaign.",
  robots: { index: false, follow: false },
};

export default function FoundersPage() {
  const campaign = foundersCampaign;
  const checkoutEnabled = process.env.SQUARE_PAYMENTS_ENABLED === "true";

  return (
    <main className="founders-page">
      <header className="founders-header">
        <Link href="/" className="founders-wordmark" aria-label="Fawcett Tattoos home">
          FAWCETT TATTOOS
        </Link>
        <span>Founders / Private preview</span>
      </header>

      <section className="founders-hero">
        <div className="founders-orb" aria-hidden="true" />
        <div className="founders-hero-copy">
          <p className="founders-kicker">{campaign.eyebrow}</p>
          <h1>{campaign.title}</h1>
          <p className="founders-hero-intro">
            An invitation to stand behind the future of Fawcett—and be part of
            the studio&apos;s story from the beginning of what comes next.
          </p>
          <div className="founders-launch-state">
            <span aria-hidden="true" />
            <div>
              <strong>Support launching soon</strong>
              <p>No payments or contribution submissions are being accepted yet.</p>
            </div>
          </div>
        </div>
        <aside className="founders-hero-stat" aria-label="Campaign goal">
          <span>Campaign goal</span>
          <strong>{formatCampaignCurrency(campaign.goalCents)}</strong>
          <small>Canadian dollars</small>
        </aside>
      </section>

      <div className="founders-shell">
        <ProgressMeter
          amountRaisedCents={campaign.amountRaisedCents}
          goalCents={campaign.goalCents}
          supporterCount={campaign.supporterCount}
        />

        <section className="founders-story founders-section" aria-labelledby="founders-story-title">
          <div>
            <p className="founders-kicker">The next chapter</p>
            <h2 id="founders-story-title">Built with the people who believe in the work.</h2>
          </div>
          <div className="founders-story-copy">
            {campaign.story.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <div className="founders-principle">
              <strong>
                {formatCampaignCurrency(campaign.minimumFounderSupportCents)} minimum
              </strong>
              <span>qualifies for permanent Founder status</span>
            </div>
          </div>
        </section>

        <section className="founders-section" aria-labelledby="milestones-title">
          <div className="founders-section-heading">
            <p className="founders-kicker">Expansion milestones</p>
            <h2 id="milestones-title">A deliberate path forward.</h2>
            <p>These are the campaign&apos;s intended stages—not claims of completed work.</p>
          </div>
          <div className="founders-milestones">
            {campaign.milestones.map((milestone, index) => (
              <article key={milestone.title}>
                <div className="founders-milestone-number">0{index + 1}</div>
                <p>{milestone.label}</p>
                <h3>{milestone.title}</h3>
                <span>{milestone.description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="founders-section" aria-labelledby="rewards-title">
          <div className="founders-section-heading founders-rewards-heading">
            <div>
              <p className="founders-kicker">Founder rewards</p>
              <h2 id="rewards-title">Choose how you show up.</h2>
            </div>
            <p>
              Recognition is anonymous by default. A public Founder Wall is not
              currently available, and Founder and VIP remain separate statuses.
            </p>
          </div>
          <div className="founders-tiers">
            {campaign.rewardTiers.map((tier) => (
              <RewardTierCard
                key={tier.amountCents}
                tier={tier}
                featured={tier.amountCents === 10000}
                checkoutEnabled={checkoutEnabled}
              />
            ))}
            <article className="founders-tier founders-tier-custom">
              <p className="founders-kicker">Custom support</p>
              <h3>Coming later</h3>
              <p>More ways to support may be introduced when the campaign launches.</p>
            </article>
          </div>
        </section>

        <section className="founders-closing" aria-labelledby="founders-closing-title">
          <p className="founders-kicker">Private preview</p>
          <h2 id="founders-closing-title">The foundation starts at zero.</h2>
          <p>
            No inflated counters. No invented momentum. Just a clear goal and an
            honest invitation—ready for the people who want to help build what&apos;s next.
          </p>
          <div className="founders-disabled-button" aria-disabled="true">
            Support launching soon
          </div>
        </section>

        <footer className="founders-disclaimer">
          <p>
            Support is not a charitable donation, investment, loan, ownership
            interest, or promise of financial return. No charitable tax receipt is issued.
          </p>
          <p>© Fawcett Tattoos &amp; Art Studio</p>
        </footer>
      </div>
    </main>
  );
}
