import { formatCampaignCurrency } from "@/lib/foundersCampaign";
import {
  campaignProgressPercentage,
  formatCampaignPercentage,
} from "@/lib/payments/founderViews";

export default function ProgressMeter({
  amountRaisedCents,
  goalCents,
  supporterCount,
}) {
  const progress = campaignProgressPercentage(amountRaisedCents, goalCents);
  const accessibleAmount = Math.min(Math.max(amountRaisedCents, 0), goalCents);

  return (
    <section className="founders-progress" aria-labelledby="campaign-progress-title">
      <div className="founders-progress-heading">
        <div>
          <p className="founders-kicker" id="campaign-progress-title">
            Confirmed campaign progress
          </p>
          <p className="founders-progress-total">
            {formatCampaignCurrency(amountRaisedCents)} <span>raised</span>
          </p>
        </div>
        <div className="founders-progress-goal">
          <span>Goal</span>
          <strong>{formatCampaignCurrency(goalCents)} CAD</strong>
        </div>
      </div>

      <div
        className="founders-progress-track"
        role="progressbar"
        aria-label="Campaign progress"
        aria-valuemin="0"
        aria-valuemax={goalCents}
        aria-valuenow={accessibleAmount}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="founders-progress-footer">
        <p>{formatCampaignPercentage(amountRaisedCents, goalCents)} funded</p>
        <p>{supporterCount} confirmed supporters</p>
      </div>
      <p className="founders-zero-note">
        Confirmed contributions update this preview automatically. Public support
        has not opened yet.
      </p>
    </section>
  );
}
