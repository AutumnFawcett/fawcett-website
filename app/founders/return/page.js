import Link from "next/link";

export const metadata = { title: "Payment submitted — Fawcett Founders", robots: { index: false, follow: false } };

export default function FounderReturnPage() {
  return <main className="founders-return">
    <section>
      <p className="founders-kicker">Payment submitted</p>
      <h1>We’re confirming your payment</h1>
      <p>Your Founder status will update after Square confirms the completed payment through its secure notification.</p>
      <p>Arriving here does not confirm payment or grant Founder status. Closing or abandoning Square checkout does not itself create a confirmed contribution.</p>
      <div className="founders-return-actions"><Link href="/portal/founder">View Founder portal</Link><Link href="/founders">Return to campaign</Link></div>
    </section>
  </main>;
}
