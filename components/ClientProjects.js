"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

function timestampToMillis(timestamp) {
  if (!timestamp) return 0;

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  return 0;
}

function formatDate(timestamp) {
  const millis = timestampToMillis(timestamp);

  if (!millis) return "No date";

  return new Date(millis).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function isCountedPayment(payment) {
  return payment.status === "paid" || payment.status === "partial";
}

function getCreditDeltaCents(payment) {
  if (!isCountedPayment(payment)) return 0;

  const amount = Number(payment.amountCents || 0);

  if (payment.creditHandling === "adds_in_studio_credit") {
    return amount;
  }

  if (payment.creditHandling === "uses_in_studio_credit") {
    return -amount;
  }

  if (payment.creditHandling === "refunds_or_removes_credit") {
    return -amount;
  }

  return 0;
}

function getProjectStatusBadgeClass(status) {
  if (status === "active" || status === "approved") {
    return "rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-4 py-2 text-sm font-black text-white";
  }

  if (status === "paused" || status === "consult_needed") {
    return "rounded-full border border-yellow-400/30 bg-yellow-500/10 px-4 py-2 text-sm font-black text-yellow-100";
  }

  if (status === "cancelled" || status === "declined") {
    return "rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100";
  }

  if (status === "completed") {
    return "rounded-full border border-green-400/30 bg-green-500/10 px-4 py-2 text-sm font-black text-green-100";
  }

  return "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white/75";
}

function MiniCard({ title, value }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">
        {title}
      </p>

      <p className="mt-3 text-base font-black leading-7 text-white/75">
        {value}
      </p>
    </article>
  );
}

function StatCard({ title, value, description, featured }) {
  return (
    <article
      className={
        featured
          ? "rounded-3xl border border-[#0000cc]/60 bg-[#0000cc]/15 p-5"
          : "rounded-3xl border border-white/10 bg-white/[0.045] p-5"
      }
    >
      <p className="text-xs uppercase tracking-[0.24em] text-white/45">
        {title}
      </p>

      <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
        {value}
      </h2>

      <p className="mt-3 text-sm font-bold leading-7 text-white/65">
        {description}
      </p>
    </article>
  );
}

export default function ClientProjects() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [nowMillis, setNowMillis] = useState(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [projects, setProjects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [timelineEntries, setTimelineEntries] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNowMillis(Date.now());
    });

    const timer = window.setInterval(() => {
      setNowMillis(Date.now());
    }, 60000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const bTime =
        timestampToMillis(b.updatedAt) || timestampToMillis(b.createdAt);
      const aTime =
        timestampToMillis(a.updatedAt) || timestampToMillis(a.createdAt);

      return bTime - aTime;
    });
  }, [projects]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return sortedProjects[0] || null;
    }

    return (
      sortedProjects.find((project) => project.id === selectedProjectId) || null
    );
  }, [sortedProjects, selectedProjectId]);

  const projectAppointments = useMemo(() => {
    if (!selectedProject) return [];

    return appointments
      .filter((appointment) => appointment.projectId === selectedProject.id)
      .sort(
        (a, b) =>
          timestampToMillis(a.startAt) - timestampToMillis(b.startAt)
      );
  }, [appointments, selectedProject]);

  const upcomingProjectAppointments = useMemo(() => {
    if (!nowMillis) {
      return projectAppointments.filter(
        (appointment) => appointment.status !== "cancelled"
      );
    }

    return projectAppointments.filter((appointment) => {
      const startMillis = timestampToMillis(appointment.startAt);

      if (!startMillis) return false;

      return startMillis >= nowMillis && appointment.status !== "cancelled";
    });
  }, [projectAppointments, nowMillis]);

  const projectPayments = useMemo(() => {
    if (!selectedProject) return [];

    return payments
      .filter((payment) => payment.projectId === selectedProject.id)
      .sort((a, b) => {
        const bTime =
          timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
        const aTime =
          timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [payments, selectedProject]);

  const projectTimeline = useMemo(() => {
    if (!selectedProject) return [];

    return timelineEntries
      .filter((entry) => entry.projectId === selectedProject.id)
      .sort((a, b) => {
        const bTime =
          timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
        const aTime =
          timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);

        return bTime - aTime;
      });
  }, [timelineEntries, selectedProject]);

  const creditSummary = useMemo(() => {
    return payments.reduce(
      (summary, payment) => {
        const delta = getCreditDeltaCents(payment);

        if (payment.creditHandling === "adds_in_studio_credit" && delta > 0) {
          summary.creditAddedCents += Number(payment.amountCents || 0);
        }

        if (payment.creditHandling === "uses_in_studio_credit" && delta < 0) {
          summary.creditUsedCents += Number(payment.amountCents || 0);
        }

        summary.balanceCents += delta;

        return summary;
      },
      {
        balanceCents: 0,
        creditAddedCents: 0,
        creditUsedCents: 0,
      }
    );
  }, [payments]);

  const projectPaymentTotalCents = useMemo(() => {
    return projectPayments.reduce((total, payment) => {
      if (!isCountedPayment(payment)) return total;

      return total + Number(payment.amountCents || 0);
    }, 0);
  }, [projectPayments]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);

      if (currentUser?.email) {
        setEmail(currentUser.email);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribers = [];

    function subscribeToOwnCollection(
      collectionName,
      setter,
      errorMessage,
      extraWhere = []
    ) {
      const collectionQuery = query(
        collection(db, collectionName),
        where("clientUid", "==", user.uid),
        ...extraWhere
      );

      const unsubscribe = onSnapshot(
        collectionQuery,
        (snapshot) => {
          const nextItems = snapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
          }));

          setter(nextItems);
          setLoadError("");
        },
        (error) => {
          console.error(error);
          setLoadError(errorMessage);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    subscribeToOwnCollection(
      "projects",
      setProjects,
      "Could not load projects."
    );

    subscribeToOwnCollection(
      "appointments",
      setAppointments,
      "Could not load appointments."
    );

    subscribeToOwnCollection(
      "payments",
      setPayments,
      "Could not load payment records."
    );

    subscribeToOwnCollection(
      "projectTimeline",
      setTimelineEntries,
      "Could not load project timeline.",
      [where("clientVisible", "==", true)]
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error(error);
      setAuthError("Login failed. Check your email and password.");
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-white/45">
            Checking Tattoo Portal login...
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
            <Link href="/" className="text-sm text-white/60 hover:text-white">
              ← Back to Website
            </Link>

            <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
              Tattoo Portal
            </p>

            <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
              Projects
            </h1>

            <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
              Log in to view your tattoo project details and studio updates.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 md:p-8">
            <h2 className="text-3xl font-black tracking-[-0.05em] text-white md:text-4xl">
              Tattoo Portal Login
            </h2>

            <form className="mt-6 grid gap-5" onSubmit={handleLogin}>
              <label className="grid gap-2 text-sm font-black text-white/80">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="min-h-14 rounded-2xl border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-white/80">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="min-h-14 rounded-2xl border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              {authError ? (
                <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
                  {authError}
                </p>
              ) : null}

              <button className="button button-primary w-full" type="submit">
                Log In
              </button>
            </form>
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
            Tattoo Portal
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
                Projects
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
                View your tattoo project status, upcoming appointments, payment
                history, and client-visible studio updates.
              </p>
            </div>

            <div className="grid gap-3 sm:flex sm:flex-wrap lg:justify-end">
              <Link
                className="button button-primary justify-center"
                href="/portal/dashboard"
              >
                Dashboard
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/messages"
              >
                Messages
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/project-timeline"
              >
                Timeline
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/appointments"
              >
                Appointments
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/credit"
              >
                Credit
              </Link>

              <button
                className="button button-secondary justify-center"
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  router.push("/tattoo-portal");
                }}
              >
                Log Out
              </button>
            </div>
          </div>

          {loadError ? (
            <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
              {loadError}
            </p>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <StatCard
              title="Projects"
              value={projects.length}
              description="Tattoo project records connected to your account."
              featured
            />

            <StatCard
              title="Selected Project Appointments"
              value={upcomingProjectAppointments.length}
              description="Upcoming appointments for the selected project."
            />

            <StatCard
              title="Selected Project Payments"
              value={formatMoneyFromCents(projectPaymentTotalCents)}
              description="Recorded payments connected to the selected project."
            />

            <StatCard
              title="In-Studio Credit"
              value={formatMoneyFromCents(creditSummary.balanceCents)}
              description="Recorded account credit based on visible payment records."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:px-8 md:py-14 xl:grid-cols-[0.42fr_1fr]">
        <aside className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Your Projects
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                Project List
              </h2>
            </div>

            <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white">
              {sortedProjects.length}
            </p>
          </div>

          {sortedProjects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-5">
              <h3 className="text-xl font-black tracking-[-0.04em] text-white">
                No projects yet.
              </h3>

              <p className="mt-3 text-base font-semibold leading-8 text-white/68">
                Once the studio creates a project from your consult or
                membership application, it will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {sortedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={
                    selectedProject?.id === project.id
                      ? "rounded-2xl border border-[#0000cc]/70 bg-[#0000cc]/20 p-4 text-left"
                      : "rounded-2xl border border-white/10 bg-black/35 p-4 text-left transition hover:border-[#0000cc]/50 hover:bg-[#0000cc]/10"
                  }
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong className="block text-base font-black text-white">
                    {project.projectName || "Tattoo Project"}
                  </strong>

                  <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white/65">
                    {formatValue(project.status)}
                  </span>

                  <span className="mt-3 block text-sm font-bold leading-6 text-white/55">
                    Artist:{" "}
                    {formatValue(project.preferredArtist || project.assignedInbox)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6">
            <Link className="button button-primary w-full" href="/consult">
              Start New Consult
            </Link>
          </div>
        </aside>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 md:p-7">
          {!selectedProject ? (
            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 md:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Project Detail
              </p>

              <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Select a project.
              </h2>

              <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-white/68">
                Choose a project to view details.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Project Detail
                    </p>

                    <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                      {selectedProject.projectName || "Tattoo Project"}
                    </h2>

                    <p className="mt-4 text-base font-semibold leading-8 text-white/62">
                      Created: {formatDate(selectedProject.createdAt)} ·
                      Updated: {formatDate(selectedProject.updatedAt)}
                    </p>
                  </div>

                  <span className={getProjectStatusBadgeClass(selectedProject.status)}>
                    {formatValue(selectedProject.status)}
                  </span>
                </div>
              </div>

              <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MiniCard
                  title="Artist / Inbox"
                  value={formatValue(
                    selectedProject.preferredArtist ||
                      selectedProject.assignedInbox ||
                      "general"
                  )}
                />

                <MiniCard
                  title="Project Source"
                  value={formatValue(selectedProject.source)}
                />

                <MiniCard
                  title="Placement"
                  value={formatValue(selectedProject.project?.placement)}
                />

                <MiniCard
                  title="Timeline"
                  value={formatValue(selectedProject.timeline?.startWindow)}
                />
              </section>

              <section className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                  Project Idea
                </p>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                  Details
                </h2>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-base font-semibold leading-8 text-white/72">
                  {selectedProject.project?.tattooIdea ||
                    selectedProject.project?.idea ||
                    "No project description provided yet."}
                </div>
              </section>

              <section className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                  Estimate Snapshot
                </p>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                  Studio Review
                </h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MiniCard
                    title="Estimate Low"
                    value={formatMoneyFromCents(
                      selectedProject.estimate?.estimateLowCents
                    )}
                  />

                  <MiniCard
                    title="Estimate High"
                    value={formatMoneyFromCents(
                      selectedProject.estimate?.estimateHighCents
                    )}
                  />

                  <MiniCard
                    title="Estimated Sessions"
                    value={
                      selectedProject.estimate?.estimatedSessions ||
                      "Not provided"
                    }
                  />

                  <MiniCard
                    title="Estimated Hours"
                    value={
                      selectedProject.estimate?.estimatedHours ||
                      "Not provided"
                    }
                  />
                </div>
              </section>

              <section className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Upcoming Appointments
                    </p>

                    <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                      Project Schedule
                    </h2>
                  </div>

                  <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-lg font-black text-white">
                    {upcomingProjectAppointments.length}
                  </p>
                </div>

                {upcomingProjectAppointments.length === 0 ? (
                  <p className="mt-5 text-base font-semibold leading-8 text-white/65">
                    No upcoming appointments for this project.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {upcomingProjectAppointments.map((appointment) => (
                      <article
                        key={appointment.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                      >
                        <strong className="block text-base font-black text-white">
                          {appointment.title || "Appointment"}
                        </strong>

                        <span className="mt-2 block text-sm font-bold leading-7 text-white/65">
                          {formatDate(appointment.startAt)}
                        </span>

                        <span className="block text-sm font-bold leading-7 text-white/55">
                          {formatValue(appointment.appointmentType)} ·{" "}
                          {formatValue(appointment.status)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Related Payments
                    </p>

                    <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                      Payment Records
                    </h2>
                  </div>

                  <p className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-lg font-black text-white">
                    {projectPayments.length}
                  </p>
                </div>

                {projectPayments.length === 0 ? (
                  <p className="mt-5 text-base font-semibold leading-8 text-white/65">
                    No payments have been attached to this project yet.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {projectPayments.slice(0, 5).map((payment) => (
                      <article
                        key={payment.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                      >
                        <strong className="block text-base font-black text-white">
                          {formatMoneyFromCents(payment.amountCents)}
                        </strong>

                        <span className="mt-2 block text-sm font-bold leading-7 text-white/65">
                          {formatValue(payment.paymentType)} ·{" "}
                          {formatValue(payment.paymentMethod)}
                        </span>

                        <span className="block text-sm font-bold leading-7 text-white/55">
                          {formatDate(payment.receivedAt)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-5 rounded-3xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Client-Visible Updates
                    </p>

                    <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                      Studio Timeline
                    </h2>
                  </div>

                  <p className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-lg font-black text-white">
                    {projectTimeline.length}
                  </p>
                </div>

                {projectTimeline.length === 0 ? (
                  <p className="mt-5 text-base font-semibold leading-8 text-white/65">
                    No client-visible timeline updates for this project yet.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {projectTimeline.slice(0, 5).map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                      >
                        <strong className="block text-base font-black text-white">
                          {entry.title || "Project Update"}
                        </strong>

                        <span className="mt-2 block text-sm font-bold leading-7 text-white/55">
                          {formatValue(entry.entryType)} ·{" "}
                          {formatDate(entry.createdAt)}
                        </span>

                        <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-white/70">
                          {entry.body}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                <div className="mt-6">
                  <Link
                    className="button button-secondary"
                    href="/portal/project-timeline"
                  >
                    View Full Timeline
                  </Link>
                </div>
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}