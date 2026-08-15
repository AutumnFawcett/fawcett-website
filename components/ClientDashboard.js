"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const portalCards = [
  {
    title: "Messages",
    label: "Inbox",
    description:
      "Message the studio, reply to consult questions, and keep project communication organized.",
    href: "/portal/messages",
  },
  {
    title: "Appointments",
    label: "Schedule",
    description:
      "View upcoming tattoo appointments, consults, and studio-booked session details.",
    href: "/portal/appointments",
  },
  {
    title: "Projects",
    label: "Tattoo Work",
    description:
      "View your tattoo project records, project status, estimates, and studio notes.",
    href: "/portal/projects",
  },
  {
    title: "Project Timeline",
    label: "Updates",
    description:
      "See client-visible project updates, planning notes, and important milestones.",
    href: "/portal/project-timeline",
  },
  {
    title: "In-Studio Credit",
    label: "Account Value",
    description:
      "View recorded tattoo credit, payments, credit use, and account value history.",
    href: "/portal/credit",
  },
  {
    title: "Membership Offers",
    label: "Offers",
    description:
      "Review Tattoo Project Membership offers, questions, responses, and next steps.",
    href: "/portal/membership-offers",
  },
];

export default function ClientDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [offers, setOffers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const creditBalance = useMemo(() => {
    return payments.reduce((total, payment) => {
      const amount = Number(payment.amount || payment.paymentAmount || 0);

      if (payment.type === "credit_use" || payment.paymentType === "credit_use") {
        return total - amount;
      }

      if (
        payment.type === "refund" ||
        payment.paymentType === "refund" ||
        payment.status === "refunded"
      ) {
        return total - amount;
      }

      return total + amount;
    }, 0);
  }, [payments]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setErrorMessage("");

      if (!currentUser) {
        setUser(null);
        setClientProfile(null);
        setIsLoading(false);
        router.push("/tattoo-portal");
        return;
      }

      setUser(currentUser);

      try {
        const clientRef = doc(db, "clients", currentUser.uid);
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
          setClientProfile(clientSnap.data());
        }

        const projectsSnap = await getDocs(
          query(
            collection(db, "projects"),
            where("clientUid", "==", currentUser.uid)
          )
        );

        const appointmentsSnap = await getDocs(
          query(
            collection(db, "appointments"),
            where("clientUid", "==", currentUser.uid)
          )
        );

        const paymentsSnap = await getDocs(
          query(
            collection(db, "payments"),
            where("clientUid", "==", currentUser.uid)
          )
        );

        const offersSnap = await getDocs(
          query(
            collection(db, "membershipOffers"),
            where("clientUid", "==", currentUser.uid)
          )
        );

        setProjects(
          projectsSnap.docs.map((projectDoc) => ({
            id: projectDoc.id,
            ...projectDoc.data(),
          }))
        );

        setAppointments(
          appointmentsSnap.docs.map((appointmentDoc) => ({
            id: appointmentDoc.id,
            ...appointmentDoc.data(),
          }))
        );

        setPayments(
          paymentsSnap.docs.map((paymentDoc) => ({
            id: paymentDoc.id,
            ...paymentDoc.data(),
          }))
        );

        setOffers(
          offersSnap.docs.map((offerDoc) => ({
            id: offerDoc.id,
            ...offerDoc.data(),
          }))
        );
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load your Tattoo Portal dashboard.");
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/tattoo-portal");
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount || 0);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-white/45">
            Loading Tattoo Portal...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Fawcett Tattoos & Art Studio
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
                Tattoo Portal.
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
                Welcome back
                {clientProfile?.clientName ? `, ${clientProfile.clientName}` : ""}.
                View your messages, appointments, tattoo projects, In-Studio
                Credit, membership offers, and studio updates.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link className="button button-primary" href="/portal/messages">
                Open Messages
              </Link>

              <button
                className="button button-secondary"
                type="button"
                onClick={handleLogout}
              >
                Log Out
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-6 rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <article className="rounded-[1.5rem] border border-[#0000cc]/60 bg-[#0000cc]/15 p-5 shadow-[0_0_35px_rgba(0,0,204,0.18)]">
              <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                In-Studio Credit
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {formatMoney(creditBalance)}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Recorded account value based on visible payment records.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Projects
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {projects.length}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Tattoo project records connected to your account.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Appointments
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {appointments.length}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Studio-booked appointments and sessions.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Offers
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                {offers.length}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Membership offers or studio proposals.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <p className="text-xs uppercase tracking-[0.32em] text-white/45">
          Tattoo Portal Tools
        </p>

        <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
          Your studio account.
        </h2>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {portalCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 text-white no-underline transition hover:-translate-y-1 hover:border-[#0000cc]/70 hover:bg-[#0000cc]/15 md:p-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h3 className="text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                  {card.title}
                </h3>

                <span className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-4 py-2 text-sm font-black text-white shadow-[0_0_24px_rgba(0,0,204,0.25)]">
                  {card.label}
                </span>
              </div>

              <p className="mt-5 text-base font-semibold leading-8 text-white/68">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
          <div className="grid gap-5 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Need something new?
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Start a new consult or review pricing.
              </h2>

              <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-white/70">
                Submit a new tattoo request, review current pricing, or return
                to the public website.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link className="button button-primary" href="/consult">
                Start Free Consult
              </Link>

              <Link className="button button-secondary" href="/pricing">
                View Pricing
              </Link>

              <Link className="button button-secondary" href="/">
                Back to Website
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}