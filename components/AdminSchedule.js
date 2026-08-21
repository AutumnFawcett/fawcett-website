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

function getStatusBadgeClass(status) {
  if (status === "confirmed" || status === "booked") {
    return "rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-4 py-2 text-sm font-black text-white shadow-[0_0_24px_rgba(0,0,204,0.22)]";
  }

  if (status === "cancelled" || status === "no_show") {
    return "rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100";
  }

  if (status === "completed") {
    return "rounded-full border border-green-400/30 bg-green-500/10 px-4 py-2 text-sm font-black text-green-100";
  }

  return "rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/75";
}

function AppointmentCard({ appointment }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-black/35 p-5 transition hover:border-[#0000cc]/45 hover:bg-[#0000cc]/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/42">
            {formatValue(appointment.appointmentType)}
          </p>

          <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
            {appointment.title || "Studio Appointment"}
          </h3>

          <p className="mt-3 text-base font-bold leading-7 text-white/68">
            {formatDate(appointment.startAt)}
          </p>
        </div>

        <span className={getStatusBadgeClass(appointment.status)}>
          {formatValue(appointment.status)}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-[1rem] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/38">
            Duration
          </p>
          <p className="mt-2 text-sm font-bold leading-7 text-white/70">
            {appointment.durationMinutes || 0} minutes
          </p>
        </div>

        <div className="rounded-[1rem] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/38">
            Artist / Inbox
          </p>
          <p className="mt-2 text-sm font-bold leading-7 text-white/70">
            {formatValue(appointment.assignedInbox)}
          </p>
        </div>

        <div className="rounded-[1rem] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/38">
            Location
          </p>
          <p className="mt-2 text-sm font-bold leading-7 text-white/70">
            {appointment.location || "Fawcett Tattoos & Art Studio"}
          </p>
        </div>

        {appointment.projectName ? (
          <div className="rounded-[1rem] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/38">
              Project
            </p>
            <p className="mt-2 text-sm font-bold leading-7 text-white/70">
              {appointment.projectName}
            </p>
          </div>
        ) : null}
      </div>

      {appointment.clientVisibleNotes ? (
        <div className="mt-5 rounded-[1rem] border border-[#0000cc]/35 bg-[#0000cc]/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">
            Studio Notes
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-7 text-white/72">
            {appointment.clientVisibleNotes}
          </p>
        </div>
      ) : null}
    </article>
  );
}

export default function ClientAppointments() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [appointments, setAppointments] = useState([]);
  const [nowMillis, setNowMillis] = useState(null);

  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    function updateNow() {
      setNowMillis(Date.now());
    }

    updateNow();

    const timer = setInterval(updateNow, 60000);

    return () => clearInterval(timer);
  }, []);

  const upcomingAppointments = useMemo(() => {
    if (!nowMillis) return [];

    return appointments
      .filter((appointment) => {
        const startMillis = timestampToMillis(appointment.startAt);

        if (!startMillis) return false;

        return startMillis >= nowMillis && appointment.status !== "cancelled";
      })
      .sort(
        (a, b) =>
          timestampToMillis(a.startAt) - timestampToMillis(b.startAt)
      );
  }, [appointments, nowMillis]);

  const pastAppointments = useMemo(() => {
    if (!nowMillis) return [];

    return appointments
      .filter((appointment) => {
        const startMillis = timestampToMillis(appointment.startAt);

        if (appointment.status === "cancelled") return true;
        if (!startMillis) return false;

        return startMillis < nowMillis;
      })
      .sort(
        (a, b) =>
          timestampToMillis(b.startAt) - timestampToMillis(a.startAt)
      );
  }, [appointments, nowMillis]);

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

    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("clientUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      appointmentsQuery,
      (snapshot) => {
        const nextAppointments = snapshot.docs.map((appointmentDoc) => ({
          id: appointmentDoc.id,
          ...appointmentDoc.data(),
        }));

        setAppointments(nextAppointments);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load appointments.");
      }
    );

    return () => unsubscribe();
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
              Appointments
            </h1>

            <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
              Log in to view your studio appointments.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_0_45px_rgba(0,0,204,0.12)] md:p-8">
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
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-white/80">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              {authError ? (
                <p className="rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
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
                Appointments
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
                View your upcoming consults, tattoo sessions, touch-ups, and
                studio appointments.
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
                href="/consult"
              >
                Start Free Consult
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/credit"
              >
                Credit
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/membership-offers"
              >
                Membership Offers
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
            <p className="mt-6 rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
              {loadError}
            </p>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-[1.5rem] border border-[#0000cc]/60 bg-[#0000cc]/15 p-5 shadow-[0_0_35px_rgba(0,0,204,0.18)]">
              <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                Upcoming
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
                {upcomingAppointments.length}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Future appointments currently visible in your Tattoo Portal.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Past / Cancelled
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
                {pastAppointments.length}
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Completed, past, or cancelled appointment records.
              </p>
            </article>

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                Need Changes?
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                Message Us
              </h2>

              <p className="mt-3 text-sm font-bold leading-7 text-white/65">
                Use messages for appointment questions, healed photos, or
                schedule updates.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:px-8 md:py-14 xl:grid-cols-2">
        <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Upcoming Appointments
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                What’s next.
              </h2>
            </div>

            <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)]">
              {upcomingAppointments.length}
            </p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-black/35 p-5">
              <p className="text-base font-semibold leading-8 text-white/68">
                No upcoming appointments yet.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link className="button button-primary" href="/consult">
                  Start Free Consult
                </Link>

                <Link
                  className="button button-secondary"
                  href="/portal/messages"
                >
                  Message Studio
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {upcomingAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                />
              ))}
            </div>
          )}
        </article>

        <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Past / Cancelled
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Appointment history.
              </h2>
            </div>

            <p className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white">
              {pastAppointments.length}
            </p>
          </div>

          {pastAppointments.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-black/35 p-5">
              <p className="text-base font-semibold leading-8 text-white/68">
                No past appointments yet.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {pastAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                />
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}