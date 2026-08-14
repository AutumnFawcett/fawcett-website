"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
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

function getStatusClass(status) {
  if (status === "confirmed" || status === "booked") {
    return "appointment-status appointment-status-good";
  }

  if (status === "cancelled" || status === "no_show") {
    return "appointment-status appointment-status-bad";
  }

  if (status === "completed") {
    return "appointment-status appointment-status-complete";
  }

  return "appointment-status";
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
      <main className="portal-page">
        <section className="portal-card">
          <p>Checking login...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="portal-page">
        <section className="portal-card portal-login-card">
          <p className="eyebrow">Tattoo Portal</p>
          <h1>Appointments</h1>

          <p>Log in to view your studio appointments.</p>

          <form className="portal-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {authError && <p className="error-message">{authError}</p>}

            <button className="button button-primary" type="submit">
              Log In
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-page">
      <section className="portal-header">
        <div>
          <p className="eyebrow">Tattoo Portal</p>
          <h1>Appointments</h1>

          <p>
            View your upcoming consults, tattoo sessions, touch-ups, and studio
            appointments.
          </p>
        </div>

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link className="button button-secondary" href="/portal/project-timeline">
            Timeline
        </Link>

          <Link className="button button-secondary" href="/consult">
            New Consult
          </Link>

          <Link className="button button-secondary" href="/portal/credit">
            Credit
          </Link>

          <Link className="button button-secondary" href="/portal/membership-offers">
            Membership Offers
          </Link>
            
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => {
            await signOut(auth);
            router.push("/tattoo-portal");
          }}
        >
          Log Out
        </button>
        </div>
      </section>

      {loadError && <p className="error-message">{loadError}</p>}

      <section className="portal-appointments-layout">
        <article className="portal-card">
          <div className="panel-heading">
            <h2>Upcoming Appointments</h2>
            <p>{upcomingAppointments.length}</p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p>No upcoming appointments yet.</p>
          ) : (
            <div className="appointment-list">
              {upcomingAppointments.map((appointment) => (
                <div key={appointment.id} className="appointment-card">
                  <div className="appointment-card-header">
                    <div>
                      <h3>{appointment.title || "Studio Appointment"}</h3>
                      <p>{formatDate(appointment.startAt)}</p>
                    </div>

                    <span className={getStatusClass(appointment.status)}>
                      {formatValue(appointment.status)}
                    </span>
                  </div>

                  <div className="appointment-details-grid">
                    <p>
                      <strong>Type:</strong>{" "}
                      {formatValue(appointment.appointmentType)}
                    </p>

                    <p>
                      <strong>Duration:</strong>{" "}
                      {appointment.durationMinutes || 0} minutes
                    </p>

                    <p>
                      <strong>Artist / Inbox:</strong>{" "}
                      {formatValue(appointment.assignedInbox)}
                    </p>

                    <p>
                      <strong>Location:</strong>{" "}
                      {appointment.location || "Fawcett Tattoos & Art Studio"}
                    </p>

                    {appointment.projectName ? (
                      <p>
                        <strong>Project:</strong> {appointment.projectName}
                      </p>
                    ) : null}
                  </div>

                  {appointment.clientVisibleNotes ? (
                    <p className="appointment-notes">
                      {appointment.clientVisibleNotes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="portal-card">
          <div className="panel-heading">
            <h2>Past / Cancelled</h2>
            <p>{pastAppointments.length}</p>
          </div>

          {pastAppointments.length === 0 ? (
            <p>No past appointments yet.</p>
          ) : (
            <div className="appointment-list">
              {pastAppointments.map((appointment) => (
                <div key={appointment.id} className="appointment-card">
                  <div className="appointment-card-header">
                    <div>
                      <h3>{appointment.title || "Studio Appointment"}</h3>
                      <p>{formatDate(appointment.startAt)}</p>
                    </div>

                    <span className={getStatusClass(appointment.status)}>
                      {formatValue(appointment.status)}
                    </span>
                  </div>

                  <div className="appointment-details-grid">
                    <p>
                      <strong>Type:</strong>{" "}
                      {formatValue(appointment.appointmentType)}
                    </p>

                    <p>
                      <strong>Duration:</strong>{" "}
                      {appointment.durationMinutes || 0} minutes
                    </p>

                    <p>
                      <strong>Artist / Inbox:</strong>{" "}
                      {formatValue(appointment.assignedInbox)}
                    </p>

                    <p>
                      <strong>Location:</strong>{" "}
                      {appointment.location || "Fawcett Tattoos & Art Studio"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}