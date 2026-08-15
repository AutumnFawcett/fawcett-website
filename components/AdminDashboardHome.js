"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const dashboardCards = [
  {
    title: "Intake",
    description:
      "Review new consults, membership applications, messages, offer responses, and payment requests.",
    href: "/admin/intake",
    label: "Start Here",
  },
  {
    title: "Inbox",
    description:
      "View Tattoo Portal conversations and reply from General, Ben, or Autumn inboxes.",
    href: "/admin/inbox",
    label: "Messages",
  },
  {
    title: "Clients",
    description:
      "Open client files, contact details, requests, projects, payments, credit, and notes.",
    href: "/admin/clients",
    label: "Client Hub",
  },
  {
    title: "Consult Requests",
    description:
      "Review regular tattoo consult requests and create projects from approved requests.",
    href: "/admin/consults",
    label: "Consults",
  },
  {
    title: "Membership Applications",
    description:
      "Review Tattoo Project Membership waitlist applications and project fit.",
    href: "/admin/applications",
    label: "Applications",
  },
  {
    title: "Projects",
    description:
      "Manage tattoo projects, project status, artist assignment, estimates, and notes.",
    href: "/admin/projects",
    label: "Projects",
  },
  {
    title: "Schedule",
    description:
      "Create and manage tattoo appointments connected to client records.",
    href: "/admin/schedule",
    label: "Appointments",
  },
  {
    title: "Payments",
    description:
      "Record payments, payment methods, In-Studio Credit use, and studio payment notes.",
    href: "/admin/payments",
    label: "Payments",
  },
  {
    title: "Credit Ledger",
    description:
      "Track client In-Studio Credit additions, use, adjustments, and balance history.",
    href: "/admin/credit-ledger",
    label: "Credit",
  },
  {
    title: "Membership Offers",
    description:
      "Create standard or custom membership offers for approved clients.",
    href: "/admin/membership-offers",
    label: "Offers",
  },
  {
    title: "Offer Responses",
    description:
      "Review client responses to membership offers, questions, acceptances, or declines.",
    href: "/admin/membership-offer-responses",
    label: "Responses",
  },
  {
    title: "Membership Requests",
    description:
      "Review pause, cancel, or membership change requests submitted through the Tattoo Portal.",
    href: "/admin/membership-requests",
    label: "Requests",
  },
  {
    title: "Project Timeline",
    description:
      "Add client-visible or private project timeline notes and studio updates.",
    href: "/admin/project-timeline",
    label: "Timeline",
  },
];

const publicLinks = [
  {
    title: "Website Home",
    href: "/",
  },
  {
    title: "Pricing",
    href: "/pricing",
  },
  {
    title: "Consult Page",
    href: "/consult",
  },
  {
    title: "Aftercare",
    href: "/aftercare",
  },
  {
    title: "Tattoo Credit Waitlist",
    href: "/tattoo-project-membership",
  },
  {
    title: "Tattoo Portal",
    href: "/tattoo-portal",
  },
];

export default function AdminDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAccessError("");

      if (!currentUser) {
        setUser(null);
        setAdminProfile(null);
        setIsCheckingAccess(false);
        router.push("/tattoo-portal");
        return;
      }

      try {
        const adminRef = doc(db, "adminUsers", currentUser.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists() || adminSnap.data().active !== true) {
          await signOut(auth);
          setUser(null);
          setAdminProfile(null);
          setAccessError("This account is not approved for admin access.");
          setIsCheckingAccess(false);
          router.push("/tattoo-portal");
          return;
        }

        setUser(currentUser);
        setAdminProfile(adminSnap.data());
      } catch (error) {
        console.error(error);
        setAccessError("Could not verify admin access.");
      } finally {
        setIsCheckingAccess(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleLogout() {
    await signOut(auth);
    router.push("/tattoo-portal");
  }

  if (isCheckingAccess) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-white/45">
            Checking admin access...
          </p>
        </section>
      </main>
    );
  }

  if (accessError && !user) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
          <div className="rounded-[2rem] border border-red-400/25 bg-red-500/10 p-5 md:p-8">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-red-100/60">
              Admin Access
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] text-white md:text-6xl">
              Access denied.
            </h1>

            <p className="mt-5 text-base font-semibold leading-8 text-red-50/75">
              {accessError}
            </p>

            <Link className="button button-primary mt-6" href="/tattoo-portal">
              Back to Tattoo Portal
            </Link>
          </div>
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
                Admin Dashboard.
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
                Manage intake, Tattoo Portal messages, client files, projects,
                appointments, payments, In-Studio Credit, and membership
                requests from one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link className="button button-primary" href="/admin/intake">
                Open Intake
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

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-[1.5rem] border border-[#0000cc]/60 bg-[#0000cc]/15 p-5 shadow-[0_0_35px_rgba(0,0,204,0.18)]">
              <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                Signed In
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                {adminProfile?.displayName || user?.email || "Admin"}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Approved studio admin account.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Best First Step
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                Intake
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Start here to review what needs your attention.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Public Site
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                Launch Check
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Check pricing, consult, aftercare, policies, and waitlist pages.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        <p className="text-xs uppercase tracking-[0.32em] text-white/45">
          Admin Tools
        </p>

        <h2 className="mt-4 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
          Studio control center.
        </h2>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {dashboardCards.map((card) => (
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
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Public Page Shortcuts
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {publicLinks.map((link) => (
              <Link
                key={link.title}
                className="button button-secondary"
                href={link.href}
              >
                {link.title}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}