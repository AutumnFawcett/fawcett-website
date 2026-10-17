import Link from "next/link";
import { paymentPlans } from "@/lib/paymentPlans.mjs";

export const metadata = {
  title: "Tattoo Project Payment Plans",
  description: "Explore Starter, Builder and Commitment tattoo project payment plans. Request a plan through a free consultation. No payments collected or subscriptions activated.",
};

export default function TattooProjectMembershipPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(ellipse_at_top_right,rgba(0,0,204,0.25),transparent_65%)]">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-20">
          <Link href="/" className="text-sm text-white/70 hover:text-white">← Back to Home</Link>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.28em] text-white/60">Fawcett Tattoos &amp; Art Studio</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.06em] md:text-7xl">Big tattoo ideas.<br />A plan to build toward them.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">Explore a payment plan for your next tattoo project. Choose a starting point, tell us your idea, and work with the studio to review what fits.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#payment-plans" className="button button-primary">Explore the Plans</a>
            <Link href="/consult" className="button button-secondary">Start a Free Consult</Link>
          </div>
          <p className="mt-6 text-sm leading-6 text-white/65">Applications open · No payment collected · No recurring subscription activated</p>
        </div>
      </section>
      <section id="payment-plans" aria-labelledby="plans-heading" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-12 md:px-8 md:py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-white/60">Tattoo Project Payment Plans</p>
        <h2 id="plans-heading" className="mt-3 text-3xl font-black tracking-[-0.04em] md:text-5xl">Choose your starting point.</h2>
        <p className="mt-4 max-w-3xl leading-7 text-white/75">Proposed contributions in Canadian dollars. These are payment-plan preferences, not tattoo prices or active subscriptions.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {paymentPlans.map((plan) => (
            <article key={plan.id} className="flex flex-col rounded-[1.6rem] border border-white/15 bg-white/[0.045] p-6 md:p-7">
              <h3 className="text-2xl font-black tracking-[-0.04em]">{plan.name}</h3>
              <p className="mt-6 text-4xl font-black tracking-tight">{plan.initial}<span className="ml-2 text-base font-normal text-white/65">initial</span></p>
              <p className="mt-2 text-xl font-bold text-white/90">+ {plan.monthly}<span className="font-normal text-white/65">/month</span></p>
              <p className="mb-7 mt-5 flex-1 leading-7 text-white/75">{plan.description}</p>
              <Link href={`/consult?plan=${plan.id}#consult-form`} className="button button-primary" aria-label={`Request ${plan.name} plan`}>Request {plan.name}</Link>
            </article>
          ))}
        </div>
        <div className="mt-7 rounded-2xl border border-[#4444ff]/50 bg-[#0000cc]/15 p-6 md:p-8">
          <h3 className="text-xl font-bold">Your project. Your Fawcett Studio Credit.</h3>
          <p className="mt-3 max-w-4xl leading-8 text-white/80">Payments are intended to become dollar-for-dollar Fawcett Studio Credit, subject to the final disclosed program terms. Before any payment or enrollment, the studio will explain credit use, any applicable costs, the payment schedule, and pause, cancellation and refund terms for your review.</p>
        </div>
      </section>
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <h2 className="text-3xl font-black tracking-[-0.04em] md:text-5xl">A conversation comes first.</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ["01 / Request", "Select a preferred plan and share your tattoo idea through our existing consultation form."],
              ["02 / Studio review", "We review your project, estimated scope, artist availability and preferred contributions together."],
              ["03 / Review terms", "Receive the final program terms before deciding whether to proceed. No charges start from this request."],
            ].map(([title, text]) => <li key={title} className="rounded-2xl border border-white/10 p-6"><h3 className="text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-white/75">{text}</p></li>)}
          </ol>
          <p className="mt-8 max-w-4xl leading-7 text-white/75">A request does not guarantee approval, a tattoo price, an appointment or artist availability. Your final project estimate and booking arrangements are reviewed separately. There is no checkout or recurring billing on this page.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/consult" className="button button-primary">Not Sure? Talk to Us</Link><Link href="/pricing" className="button button-secondary">View Studio Pricing</Link><Link href="/tattoo-portal" className="button button-secondary">Tattoo Portal Login</Link></div>
        </div>
      </section>
    </main>
  );
}
