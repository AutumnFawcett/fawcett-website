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

const timelineTypeLabels = {
  general_note: "General Note",
  consult_note: "Consult Note",
  design_note: "Design Note",
  session_note: "Session Note",
  payment_note: "Payment Note",
  membership_note: "Membership Note",
  client_update: "Client Update",
  milestone: "Milestone",
  reminder: "Reminder",
  health_skin_note: "Health / Skin Note",
  other: "Other",
};

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

function getTimelineTypeLabel(type) {
  return timelineTypeLabels[type] || formatValue(type);
}

function getStatusClass(status) {
  if (status === "completed") {
    return "client-timeline-pill client-timeline-pill-good";
  }

  if (status === "important") {
    return "client-timeline-pill client-timeline-pill-watch";
  }

  return "client-timeline-pill";
}

export default function ClientProjectTimeline() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [timelineEntries, setTimelineEntries] = useState([]);
  const [projects, setProjects] = useState([]);

  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");

  const visibleProjects = useMemo(() => {
    const projectMap = new Map();

    projects.forEach((project) => {
      if (!project.id) return;

      projectMap.set(project.id, {
        id: project.id,
        projectName: project.projectName || "Tattoo Project",
        status: project.status || "review",
      });
    });

    timelineEntries.forEach((entry) => {
      if (!entry.projectId) return;

      if (!projectMap.has(entry.projectId)) {
        projectMap.set(entry.projectId, {
          id: entry.projectId,
          projectName: entry.projectName || "Tattoo Project",
          status: "timeline",
        });
      }
    });

    return Array.from(projectMap.values()).sort((a, b) =>
      a.projectName.localeCompare(b.projectName)
    );
  }, [projects, timelineEntries]);

  const filteredTimelineEntries = useMemo(() => {
    return timelineEntries
      .filter((entry) => {
        if (projectFilter !== "all" && entry.projectId !== projectFilter) {
          return false;
        }

        if (typeFilter !== "all" && entry.entryType !== typeFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const bTime = timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
        const aTime = timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);

        return bTime - aTime;
      });
  }, [timelineEntries, projectFilter, typeFilter]);

  const importantEntries = useMemo(() => {
    return filteredTimelineEntries.filter((entry) => entry.important);
  }, [filteredTimelineEntries]);

  const latestEntry = filteredTimelineEntries[0] || null;

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

    const timelineQuery = query(
      collection(db, "projectTimeline"),
      where("clientUid", "==", user.uid),
      where("clientVisible", "==", true)
    );

    const projectsQuery = query(
      collection(db, "projects"),
      where("clientUid", "==", user.uid)
    );

    const unsubscribeTimeline = onSnapshot(
      timelineQuery,
      (snapshot) => {
        const nextEntries = snapshot.docs.map((entryDoc) => ({
          id: entryDoc.id,
          ...entryDoc.data(),
        }));

        setTimelineEntries(nextEntries);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load project timeline.");
      }
    );

    const unsubscribeProjects = onSnapshot(
      projectsQuery,
      (snapshot) => {
        const nextProjects = snapshot.docs.map((projectDoc) => ({
          id: projectDoc.id,
          ...projectDoc.data(),
        }));

        setProjects(nextProjects);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load projects.");
      }
    );

    return () => {
      unsubscribeTimeline();
      unsubscribeProjects();
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
          <h1>Project Timeline</h1>

          <p>Log in to view client-visible project updates from the studio.</p>

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
          <h1>Project Timeline</h1>

          <p>
            View studio updates, milestones, design notes, reminders, and
            client-visible project history.
          </p>
        </div>

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>

          <Link className="button button-secondary" href="/portal/credit">
            Credit
          </Link>

          <Link
            className="button button-secondary"
            href="/portal/membership-offers"
          >
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

      <section className="client-timeline-summary-grid">
        <article className="portal-stat-card">
          <p>Visible Updates</p>
          <strong>{filteredTimelineEntries.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Projects</p>
          <strong>{visibleProjects.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Important</p>
          <strong>{importantEntries.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Latest Update</p>
          <strong>{latestEntry ? formatDate(latestEntry.createdAt) : "None"}</strong>
        </article>
      </section>

      <section className="client-timeline-layout">
        <aside className="portal-card client-timeline-sidebar">
          <h2>Filter Timeline</h2>

          <div className="client-timeline-filters">
            <label>
              Project
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
              >
                <option value="all">All projects</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Update Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All update types</option>
                <option value="client_update">Client Updates</option>
                <option value="milestone">Milestones</option>
                <option value="design_note">Design Notes</option>
                <option value="session_note">Session Notes</option>
                <option value="consult_note">Consult Notes</option>
                <option value="reminder">Reminders</option>
                <option value="membership_note">Membership Notes</option>
                <option value="general_note">General Notes</option>
              </select>
            </label>
          </div>

          <div className="mini-record-list">
            <div className="mini-record-card">
              <strong>Only client-visible updates appear here.</strong>
              <span>
                Private admin notes, internal reminders, and studio-only details
                are not shown in the tattoo portal.
              </span>
            </div>

            <div className="mini-record-card">
              <strong>Need clarification?</strong>
              <span>
                Message the studio if a project update looks incorrect or you
                have questions.
              </span>
            </div>
          </div>

          <div className="portal-card-action">
            <Link className="button button-primary" href="/portal/messages">
              Message the Studio
            </Link>
          </div>
        </aside>

        <section className="portal-card client-timeline-main">
          <div className="panel-heading">
            <h2>Timeline Updates</h2>
            <p>{filteredTimelineEntries.length}</p>
          </div>

          {filteredTimelineEntries.length === 0 ? (
            <div className="empty-state">
              <h3>No client-visible timeline updates yet.</h3>
              <p>
                Once the studio marks a project note or update as client-visible,
                it will appear here.
              </p>
            </div>
          ) : (
            <div className="client-timeline-list">
              {filteredTimelineEntries.map((entry) => (
                <article key={entry.id} className="client-timeline-card">
                  <div className="client-timeline-card-header">
                    <div>
                      <p className="eyebrow">
                        {getTimelineTypeLabel(entry.entryType)}
                      </p>
                      <h2>{entry.title || "Project Update"}</h2>
                      <span>{formatDate(entry.createdAt)}</span>
                    </div>

                    <div className="client-timeline-pill-row">
                      <span className={getStatusClass(entry.status)}>
                        {formatValue(entry.status || "open")}
                      </span>

                      {entry.important ? (
                        <span className="client-timeline-pill client-timeline-pill-watch">
                          Important
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p>{entry.body}</p>

                  {entry.projectName ? (
                    <div className="client-timeline-project-label">
                      Project: {entry.projectName}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}