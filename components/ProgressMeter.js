import { formatCampaignCurrency } from "@/lib/foundersCampaign";

export default function ProgressMeter({ amountRaised, goal, supporterCount }) {
  const progress = goal > 0 ? Math.min((amountRaised / goal) * 100, 100) : 0;

  return (
    <section className="founders-progress" aria-labelledby="campaign-progress-title">
      <div className="founders-progress-heading">
        <div>
          <p className="founders-kicker" id="campaign-progress-title">
            Confirmed campaign progress
          </p>
          <p className="founders-progress-total">
            {formatCampaignCurrency(amountRaised)} <span>raised</span>
          </p>
        </div>
        <div className="founders-progress-goal">
          <span>Goal</span>
          <strong>{formatCampaignCurrency(goal)} CAD</strong>
        </div>
      </div>

      <div
        className="founders-progress-track"
        role="progressbar"
        aria-label="Campaign progress"
        aria-valuemin="0"
        aria-valuemax={goal}
        aria-valuenow={amountRaised}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="founders-progress-footer">
        <p>{progress.toFixed(0)}% funded</p>
        <p>{supporterCount} confirmed supporters</p>
      </div>
      <p className="founders-zero-note">
        The campaign has not opened for support yet. This confirmed starting point
        will update only when the campaign launches.
      </p>
    </section>
  );
}
