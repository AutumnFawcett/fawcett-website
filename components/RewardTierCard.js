import { formatCampaignCurrency } from "@/lib/foundersCampaign";

export default function RewardTierCard({ tier, featured = false }) {
  return (
    <article className={`founders-tier${featured ? " founders-tier-featured" : ""}`}>
      <div className="founders-tier-topline">
        <p>{tier.title}</p>
        {featured && <span>Signature tier</span>}
      </div>
      <h3>{formatCampaignCurrency(tier.amountCents)}</h3>
      <p className="founders-tier-currency">CAD confirmed support</p>
      <ul>
        {tier.rewards.map((reward) => (
          <li key={reward}>{reward}</li>
        ))}
      </ul>
      <div className="founders-tier-status" aria-label="This reward tier is not available yet">
        Available at launch
      </div>
    </article>
  );
}
