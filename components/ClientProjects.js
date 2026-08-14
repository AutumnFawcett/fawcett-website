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

function getProjectStatusClass(status) {
  if (status === "active" || status === "approved") {
    return "client-project-pill client-project-pill-good";
  }

  if (status === "paused" || status === "consult_needed") {
    return "client-project-pill client-project-pill-watch";
  }

  if (status === "cancelled" || status === "declined") {
    return "client-project-pill client-project-pill-bad";
  }

  return "client-project-pill";
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
          <h1>Projects</h1>

          <p>Log in to view your tattoo project details and updates.</p>

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
          <h1>Projects</h1>

          <p>
            View your tattoo project status, upcoming appointments, payment
            history, and client-visible studio updates.
          </p>
        </div>

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link
            className="button button-secondary"
            href="/portal/project-timeline"
          >
            Timeline
          </Link>

          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>

          <Link className="button button-secondary" href="/portal/credit">
            Credit
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

      <section className="client-project-summary-grid">
        <article className="portal-stat-card">
          <p>Projects</p>
          <strong>{projects.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Upcoming Appointments</p>
          <strong>{upcomingProjectAppointments.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Project Payments</p>
          <strong>{formatMoneyFromCents(projectPaymentTotalCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>In-Studio Credit</p>
          <strong>{formatMoneyFromCents(creditSummary.balanceCents)}</strong>
        </article>
      </section>

      <section className="client-project-layout">
        <aside className="portal-card client-project-sidebar">
          <div className="panel-heading">
            <h2>Your Projects</h2>
            <p>{sortedProjects.length}</p>
          </div>

          {sortedProjects.length === 0 ? (
            <div className="empty-state">
              <h3>No projects yet.</h3>
              <p>
                Once the studio creates a project from your consult or membership
                application, it will appear here.
              </p>
            </div>
          ) : (
            <div className="client-project-list">
              {sortedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={
                    selectedProject?.id === project.id
                      ? "client-project-button client-project-button-active"
                      : "client-project-button"
                  }
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.projectName || "Tattoo Project"}</strong>
                  <span>{formatValue(project.status)}</span>
                  <span>
                    Artist:{" "}
                    {formatValue(
                      project.preferredArtist || project.assignedInbox
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="portal-card-action">
            <Link className="button button-primary" href="/consult">
              Start New Consult
            </Link>
          </div>
        </aside>

        <section className="portal-card client-project-detail-card">
          {!selectedProject ? (
            <div className="empty-state">
              <h2>Select a project</h2>
              <p>Choose a project to view details.</p>
            </div>
          ) : (
            <>
              <div className="client-project-detail-header">
                <div>
                  <p className="eyebrow">Project Detail</p>
                  <h2>{selectedProject.projectName || "Tattoo Project"}</h2>
                  <p>
                    Created: {formatDate(selectedProject.createdAt)} · Updated:{" "}
                    {formatDate(selectedProject.updatedAt)}
                  </p>
                </div>

                <span className={getProjectStatusClass(selectedProject.status)}>
                  {formatValue(selectedProject.status)}
                </span>
              </div>

              <section className="client-project-detail-grid">
                <article className="mini-record-card">
                  <strong>Artist / Inbox</strong>
                  <span>
                    {formatValue(
                      selectedProject.preferredArtist ||
                        selectedProject.assignedInbox ||
                        "general"
                    )}
                  </span>
                </article>

                <article className="mini-record-card">
                  <strong>Project Source</strong>
                  <span>{formatValue(selectedProject.source)}</span>
                </article>

                <article className="mini-record-card">
                  <strong>Placement</strong>
                  <span>{formatValue(selectedProject.project?.placement)}</span>
                </article>

                <article className="mini-record-card">
                  <strong>Timeline</strong>
                  <span>{formatValue(selectedProject.timeline?.startWindow)}</span>
                </article>
              </section>

              <section className="client-project-section">
                <div className="panel-heading">
                  <h2>Project Idea</h2>
                  <p>Details</p>
                </div>

                <div className="client-project-note-box">
                  {selectedProject.project?.tattooIdea ||
                    selectedProject.project?.idea ||
                    "No project description provided yet."}
                </div>
              </section>

              <section className="client-project-section">
                <div className="panel-heading">
                  <h2>Estimate Snapshot</h2>
                  <p>Studio Review</p>
                </div>

                <section className="client-project-detail-grid">
                  <article className="mini-record-card">
                    <strong>Estimate Low</strong>
                    <span>
                      {formatMoneyFromCents(
                        selectedProject.estimate?.estimateLowCents
                      )}
                    </span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Estimate High</strong>
                    <span>
                      {formatMoneyFromCents(
                        selectedProject.estimate?.estimateHighCents
                      )}
                    </span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Estimated Sessions</strong>
                    <span>
                      {selectedProject.estimate?.estimatedSessions ||
                        "Not provided"}
                    </span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Estimated Hours</strong>
                    <span>
                      {selectedProject.estimate?.estimatedHours ||
                        "Not provided"}
                    </span>
                  </article>
                </section>
              </section>

              <section className="client-project-section">
                <div className="panel-heading">
                  <h2>Upcoming Appointments</h2>
                  <p>{upcomingProjectAppointments.length}</p>
                </div>

                {upcomingProjectAppointments.length === 0 ? (
                  <p>No upcoming appointments for this project.</p>
                ) : (
                  <div className="mini-record-list">
                    {upcomingProjectAppointments.map((appointment) => (
                      <div key={appointment.id} className="mini-record-card">
                        <strong>{appointment.title || "Appointment"}</strong>
                        <span>{formatDate(appointment.startAt)}</span>
                        <span>
                          {formatValue(appointment.appointmentType)} ·{" "}
                          {formatValue(appointment.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="client-project-section">
                <div className="panel-heading">
                  <h2>Related Payments</h2>
                  <p>{projectPayments.length}</p>
                </div>

                {projectPayments.length === 0 ? (
                  <p>No payments have been attached to this project yet.</p>
                ) : (
                  <div className="mini-record-list">
                    {projectPayments.slice(0, 5).map((payment) => (
                      <div key={payment.id} className="mini-record-card">
                        <strong>
                          {formatMoneyFromCents(payment.amountCents)}
                        </strong>
                        <span>
                          {formatValue(payment.paymentType)} ·{" "}
                          {formatValue(payment.paymentMethod)}
                        </span>
                        <span>{formatDate(payment.receivedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="client-project-section">
                <div className="panel-heading">
                  <h2>Client-Visible Updates</h2>
                  <p>{projectTimeline.length}</p>
                </div>

                {projectTimeline.length === 0 ? (
                  <p>No client-visible timeline updates for this project yet.</p>
                ) : (
                  <div className="client-project-timeline-list">
                    {projectTimeline.slice(0, 5).map((entry) => (
                      <article
                        key={entry.id}
                        className="client-project-timeline-card"
                      >
                        <strong>{entry.title || "Project Update"}</strong>
                        <span>
                          {formatValue(entry.entryType)} ·{" "}
                          {formatDate(entry.createdAt)}
                        </span>
                        <p>{entry.body}</p>
                      </article>
                    ))}
                  </div>
                )}

                <div className="portal-card-action">
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