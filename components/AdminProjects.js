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
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const projectStatusOptions = [
  { value: "review", label: "Review" },
  { value: "consult_needed", label: "Consult Needed" },
  { value: "estimate_needed", label: "Estimate Needed" },
  { value: "estimate_sent", label: "Estimate Sent" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
];

const inboxOptions = [
  { value: "general", label: "General / Undecided" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
];

const timelineTypeOptions = [
  { value: "general_note", label: "General Note" },
  { value: "consult_note", label: "Consult Note" },
  { value: "design_note", label: "Design Note" },
  { value: "session_note", label: "Session Note" },
  { value: "payment_note", label: "Payment Note" },
  { value: "membership_note", label: "Membership Note" },
  { value: "client_update", label: "Client Update" },
  { value: "milestone", label: "Milestone" },
  { value: "reminder", label: "Reminder" },
  { value: "health_skin_note", label: "Health / Skin Note" },
  { value: "other", label: "Other" },
];

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

function dollarsToCents(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.round(numberValue * 100);
}

function centsToDollarInput(cents) {
  if (cents === null || cents === undefined || cents === "") return "";

  const numberValue = Number(cents);

  if (!Number.isFinite(numberValue)) return "";

  return (numberValue / 100).toFixed(2);
}

function isCountedPayment(payment) {
  return payment.status === "paid" || payment.status === "partial";
}

function getProjectStatusClass(status) {
  if (status === "active" || status === "approved" || status === "completed") {
    return "project-detail-pill project-detail-pill-good";
  }

  if (
    status === "paused" ||
    status === "consult_needed" ||
    status === "estimate_needed"
  ) {
    return "project-detail-pill project-detail-pill-watch";
  }

  if (status === "cancelled" || status === "declined") {
    return "project-detail-pill project-detail-pill-bad";
  }

  return "project-detail-pill";
}

function getTimelineTypeLabel(type) {
  return timelineTypeOptions.find((option) => option.value === type)?.label || formatValue(type);
}

export default function AdminProjects() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [projects, setProjects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [timelineEntries, setTimelineEntries] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [artistFilter, setArtistFilter] = useState("all");

  const [statusDraft, setStatusDraft] = useState("review");
  const [artistDraft, setArtistDraft] = useState("general");
  const [estimateLowDraft, setEstimateLowDraft] = useState("");
  const [estimateHighDraft, setEstimateHighDraft] = useState("");
  const [estimatedSessionsDraft, setEstimatedSessionsDraft] = useState("");
  const [estimatedHoursDraft, setEstimatedHoursDraft] = useState("");
  const [clientSummaryDraft, setClientSummaryDraft] = useState("");
  const [internalNotesDraft, setInternalNotesDraft] = useState("");

  const [timelineType, setTimelineType] = useState("general_note");
  const [timelineTitle, setTimelineTitle] = useState("");
  const [timelineBody, setTimelineBody] = useState("");
  const [timelineClientVisible, setTimelineClientVisible] = useState(false);
  const [timelineImportant, setTimelineImportant] = useState(false);

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return projects
      .filter((project) => {
        const status = project.status || "review";
        const artist = project.assignedInbox || project.preferredArtist || "general";

        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (artistFilter !== "all" && artist !== artistFilter) return false;

        if (!normalizedSearch) return true;

        const searchableText = [
          project.projectName,
          project.clientName,
          project.clientEmail,
          project.phone,
          project.instagram,
          project.status,
          project.assignedInbox,
          project.preferredArtist,
          project.source,
          project.project?.tattooIdea,
          project.project?.placement,
          project.adminReview?.internalProjectNotes,
          project.adminReview?.clientProjectSummary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const bTime = timestampToMillis(b.updatedAt) || timestampToMillis(b.createdAt);
        const aTime = timestampToMillis(a.updatedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [projects, searchText, statusFilter, artistFilter]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  const relatedAppointments = useMemo(() => {
    if (!selectedProject) return [];

    return appointments
      .filter((appointment) => appointment.projectId === selectedProject.id)
      .sort((a, b) => timestampToMillis(a.startAt) - timestampToMillis(b.startAt));
  }, [appointments, selectedProject]);

  const relatedPayments = useMemo(() => {
    if (!selectedProject) return [];

    return payments
      .filter((payment) => payment.projectId === selectedProject.id)
      .sort((a, b) => {
        const bTime = timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
        const aTime = timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [payments, selectedProject]);

  const relatedTimelineEntries = useMemo(() => {
    if (!selectedProject) return [];

    return timelineEntries
      .filter((entry) => entry.projectId === selectedProject.id)
      .sort((a, b) => {
        const bTime = timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
        const aTime = timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);

        return bTime - aTime;
      });
  }, [timelineEntries, selectedProject]);

  const projectPaymentTotalCents = useMemo(() => {
    return relatedPayments.reduce((total, payment) => {
      if (!isCountedPayment(payment)) return total;

      return total + Number(payment.amountCents || 0);
    }, 0);
  }, [relatedPayments]);

  const summary = useMemo(() => {
    return projects.reduce(
      (totals, project) => {
        totals.total += 1;

        if (project.status === "active") totals.active += 1;
        if (project.status === "paused") totals.paused += 1;
        if (project.status === "completed") totals.completed += 1;

        return totals;
      },
      {
        total: 0,
        active: 0,
        paused: 0,
        completed: 0,
      }
    );
  }, [projects]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAdminChecked(false);
      setIsAdmin(false);

      if (!currentUser) {
        setAdminChecked(true);
        return;
      }

      try {
        const adminRef = doc(db, "adminUsers", currentUser.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().active === true) {
          setIsAdmin(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setAdminChecked(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const unsubscribers = [];

    function subscribeToCollection(collectionName, setter, errorMessage) {
      const collectionQuery = query(collection(db, collectionName));

      const unsubscribe = onSnapshot(
        collectionQuery,
        (snapshot) => {
          const nextItems = snapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
          }));

          setter(nextItems);
          setActionError("");
        },
        (error) => {
          console.error(error);
          setActionError(errorMessage);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    subscribeToCollection("projects", setProjects, "Could not load projects.");
    subscribeToCollection("appointments", setAppointments, "Could not load appointments.");
    subscribeToCollection("payments", setPayments, "Could not load payments.");
    subscribeToCollection("projectTimeline", setTimelineEntries, "Could not load project timeline.");

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleSelectProject(project) {
    setSelectedProjectId(project.id);

    setStatusDraft(project.status || "review");
    setArtistDraft(project.assignedInbox || project.preferredArtist || "general");

    setEstimateLowDraft(centsToDollarInput(project.estimate?.estimateLowCents));
    setEstimateHighDraft(centsToDollarInput(project.estimate?.estimateHighCents));
    setEstimatedSessionsDraft(project.estimate?.estimatedSessions || "");
    setEstimatedHoursDraft(project.estimate?.estimatedHours || "");

    setClientSummaryDraft(project.adminReview?.clientProjectSummary || "");
    setInternalNotesDraft(project.adminReview?.internalProjectNotes || "");

    setTimelineType("general_note");
    setTimelineTitle("");
    setTimelineBody("");
    setTimelineClientVisible(false);
    setTimelineImportant(false);

    setActionError("");
    setActionSuccess("");
  }

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

  async function saveProjectDetails() {
    if (!selectedProject) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const projectRef = doc(db, "projects", selectedProject.id);

      await updateDoc(projectRef, {
        status: statusDraft,
        assignedInbox: artistDraft,
        preferredArtist: artistDraft,

        "estimate.estimateLowCents": dollarsToCents(estimateLowDraft),
        "estimate.estimateHighCents": dollarsToCents(estimateHighDraft),
        "estimate.estimatedSessions": estimatedSessionsDraft,
        "estimate.estimatedHours": estimatedHoursDraft,
        "estimate.updatedBy": user.email,
        "estimate.updatedAt": serverTimestamp(),

        "adminReview.clientProjectSummary": clientSummaryDraft,
        "adminReview.internalProjectNotes": internalNotesDraft,
        "adminReview.projectUpdatedBy": user.email,
        "adminReview.projectUpdatedAt": serverTimestamp(),

        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Project details saved.");
    } catch (error) {
      console.error(error);
      setActionError("Could not save project details.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createTimelineEntry(event) {
    event.preventDefault();

    if (!selectedProject) {
      setActionError("Select a project before adding a timeline entry.");
      return;
    }

    if (!timelineTitle.trim() || !timelineBody.trim()) {
      setActionError("Add a title and note before saving a timeline entry.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      await addDoc(collection(db, "projectTimeline"), {
        clientUid: selectedProject.clientUid,
        clientName: selectedProject.clientName || "",
        clientEmail: selectedProject.clientEmail || "",
        phone: selectedProject.phone || "",
        instagram: selectedProject.instagram || "",

        projectId: selectedProject.id,
        projectName: selectedProject.projectName || "Tattoo Project",

        entryType: timelineType,
        status: timelineImportant ? "important" : "open",
        title: timelineTitle.trim(),
        body: timelineBody.trim(),

        clientVisible: timelineClientVisible,
        important: timelineImportant,

        createdBy: user.email || "",
        updatedBy: user.email || "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTimelineType("general_note");
      setTimelineTitle("");
      setTimelineBody("");
      setTimelineClientVisible(false);
      setTimelineImportant(false);

      setActionSuccess("Timeline entry added to project.");
    } catch (error) {
      console.error(error);
      setActionError("Could not create timeline entry.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!adminChecked) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <p>Checking admin access...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-login-card">
          <p className="eyebrow">Admin Login</p>
          <h1>Projects</h1>

          <form className="admin-form" onSubmit={handleLogin}>
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

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <p className="eyebrow">Access Denied</p>
          <h1>This account is not an admin.</h1>

          <p>
            Add this user’s Firebase UID to the <strong>adminUsers</strong>{" "}
            collection in Firestore, then refresh.
          </p>

          <p>
            Current user: <strong>{user.email}</strong>
          </p>
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

        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Projects</h1>

          <p>
            Review tattoo projects, estimates, appointments, payments, notes,
            and timeline updates.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/admin/intake">
              Intake
          </Link>


          <Link className="button button-secondary" href="/admin/clients">
            Clients
          </Link>

          <Link className="button button-secondary" href="/admin/project-timeline">
            Timeline
          </Link>

          <Link className="button button-secondary" href="/admin/schedule">
            Schedule
          </Link>

          <Link className="button button-secondary" href="/admin/payments">
            Payments
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

      <section className="admin-project-summary-grid">
        <article className="portal-stat-card">
          <p>Total Projects</p>
          <strong>{summary.total}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Active</p>
          <strong>{summary.active}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Paused</p>
          <strong>{summary.paused}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Completed</p>
          <strong>{summary.completed}</strong>
        </article>
      </section>

      <section className="admin-project-detail-layout">
        <aside className="applications-list-panel admin-project-sidebar">
          <div className="panel-heading">
            <h2>Projects</h2>
            <p>{filteredProjects.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, project..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {projectStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Artist / Inbox
              <select
                value={artistFilter}
                onChange={(event) => setArtistFilter(event.target.value)}
              >
                <option value="all">All artists</option>
                {inboxOptions.map((inbox) => (
                  <option key={inbox.value} value={inbox.value}>
                    {inbox.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredProjects.length === 0 ? (
            <p>No projects found.</p>
          ) : (
            <div className="application-list">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={
                    selectedProjectId === project.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectProject(project)}
                >
                  <div>
                    <strong>{project.projectName || "Tattoo Project"}</strong>
                    <span>{project.clientName || project.clientEmail}</span>
                  </div>

                  <p>{project.project?.tattooIdea || "No project idea saved."}</p>

                  <div className="application-card-meta">
                    <small>{formatValue(project.status)}</small>
                    <small>{formatValue(project.assignedInbox)}</small>
                  </div>

                  <small>{formatDate(project.createdAt)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel admin-project-main-panel">
          {!selectedProject ? (
            <div className="empty-state">
              <h2>Select a project</h2>
              <p>Choose a project from the list to view and edit details.</p>
            </div>
          ) : (
            <article className="admin-card admin-project-detail-card">
              <div className="admin-project-title-row">
                <div>
                  <p className="eyebrow">Project Detail</p>
                  <h2>{selectedProject.projectName || "Tattoo Project"}</h2>
                  <p>
                    {selectedProject.clientName || "Client"} ·{" "}
                    {selectedProject.clientEmail || "No email"}
                  </p>
                </div>

                <span className={getProjectStatusClass(selectedProject.status)}>
                  {formatValue(selectedProject.status)}
                </span>
              </div>

              {actionSuccess && <p className="success-message">{actionSuccess}</p>}
              {actionError && <p className="error-message">{actionError}</p>}

              <section className="admin-project-top-grid">
                <article className="detail-card">
                  <h3>Client</h3>
                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedProject.clientName || "Not provided"}
                  </p>
                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedProject.clientEmail || "Not provided"}
                  </p>
                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedProject.phone || "Not provided"}
                  </p>
                  <p>
                    <strong>Instagram:</strong>{" "}
                    {selectedProject.instagram || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Project</h3>
                  <p>
                    <strong>Source:</strong> {formatValue(selectedProject.source)}
                  </p>
                  <p>
                    <strong>Placement:</strong>{" "}
                    {formatValue(selectedProject.project?.placement)}
                  </p>
                  <p>
                    <strong>Size / Detail:</strong>{" "}
                    {formatValue(selectedProject.project?.sizeDetail)}
                  </p>
                  <p>
                    <strong>Created:</strong>{" "}
                    {formatDate(selectedProject.createdAt)}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Money Snapshot</h3>
                  <p>
                    <strong>Project Payments:</strong>{" "}
                    {formatMoneyFromCents(projectPaymentTotalCents)}
                  </p>
                  <p>
                    <strong>Related Payments:</strong> {relatedPayments.length}
                  </p>
                  <p>
                    <strong>Appointments:</strong> {relatedAppointments.length}
                  </p>
                  <p>
                    <strong>Timeline Entries:</strong>{" "}
                    {relatedTimelineEntries.length}
                  </p>
                </article>
              </section>

              <section className="admin-project-section">
                <div className="panel-heading">
                  <h2>Project Idea</h2>
                  <p>Client supplied</p>
                </div>

                <div className="admin-note-box">
                  {selectedProject.project?.tattooIdea ||
                    selectedProject.project?.idea ||
                    "No project idea saved."}
                </div>
              </section>

              <section className="admin-project-section">
                <div className="panel-heading">
                  <h2>Edit Project</h2>
                  <p>Status / Estimate</p>
                </div>

                <div className="admin-project-edit-form">
                  <label>
                    Project Status
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                    >
                      {projectStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Artist / Inbox
                    <select
                      value={artistDraft}
                      onChange={(event) => setArtistDraft(event.target.value)}
                    >
                      {inboxOptions.map((inbox) => (
                        <option key={inbox.value} value={inbox.value}>
                          {inbox.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Estimate Low
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={estimateLowDraft}
                      onChange={(event) => setEstimateLowDraft(event.target.value)}
                    />
                  </label>

                  <label>
                    Estimate High
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={estimateHighDraft}
                      onChange={(event) => setEstimateHighDraft(event.target.value)}
                    />
                  </label>

                  <label>
                    Estimated Sessions
                    <input
                      type="text"
                      value={estimatedSessionsDraft}
                      onChange={(event) =>
                        setEstimatedSessionsDraft(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Estimated Hours
                    <input
                      type="text"
                      value={estimatedHoursDraft}
                      onChange={(event) =>
                        setEstimatedHoursDraft(event.target.value)
                      }
                    />
                  </label>

                  <label className="admin-project-edit-wide">
                    Client-Facing Project Summary
                    <textarea
                      value={clientSummaryDraft}
                      onChange={(event) => setClientSummaryDraft(event.target.value)}
                      rows={4}
                      placeholder="Optional summary that can be copied into portal messages or future client views."
                    />
                  </label>

                  <label className="admin-project-edit-wide">
                    Private Admin Notes
                    <textarea
                      value={internalNotesDraft}
                      onChange={(event) => setInternalNotesDraft(event.target.value)}
                      rows={5}
                      placeholder="Private studio notes about this project."
                    />
                  </label>

                  <button
                    className="button button-primary admin-project-edit-wide"
                    type="button"
                    onClick={saveProjectDetails}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Project Details"}
                  </button>
                </div>
              </section>

              <section className="admin-project-section">
                <div className="panel-heading">
                  <h2>Add Timeline Note</h2>
                  <p>Project history</p>
                </div>

                <form className="admin-project-timeline-form" onSubmit={createTimelineEntry}>
                  <label>
                    Type
                    <select
                      value={timelineType}
                      onChange={(event) => setTimelineType(event.target.value)}
                    >
                      {timelineTypeOptions.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Title
                    <input
                      type="text"
                      value={timelineTitle}
                      onChange={(event) => setTimelineTitle(event.target.value)}
                      placeholder="Example: Design direction confirmed"
                    />
                  </label>

                  <label className="admin-project-edit-wide">
                    Note
                    <textarea
                      value={timelineBody}
                      onChange={(event) => setTimelineBody(event.target.value)}
                      rows={4}
                      placeholder="Add a project note, reminder, design note, or client-visible update."
                    />
                  </label>

                  <div className="admin-project-checkbox-row admin-project-edit-wide">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={timelineClientVisible}
                        onChange={(event) =>
                          setTimelineClientVisible(event.target.checked)
                        }
                      />
                      Client visible
                    </label>

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={timelineImportant}
                        onChange={(event) =>
                          setTimelineImportant(event.target.checked)
                        }
                      />
                      Mark important
                    </label>
                  </div>

                  <button
                    className="button button-primary admin-project-edit-wide"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Add Timeline Note"}
                  </button>
                </form>
              </section>

              <section className="admin-project-related-grid">
                <article className="admin-card admin-project-related-card">
                  <div className="panel-heading">
                    <h2>Appointments</h2>
                    <p>{relatedAppointments.length}</p>
                  </div>

                  {relatedAppointments.length === 0 ? (
                    <p>No appointments attached to this project.</p>
                  ) : (
                    <div className="mini-record-list">
                      {relatedAppointments.slice(0, 5).map((appointment) => (
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
                </article>

                <article className="admin-card admin-project-related-card">
                  <div className="panel-heading">
                    <h2>Payments</h2>
                    <p>{relatedPayments.length}</p>
                  </div>

                  {relatedPayments.length === 0 ? (
                    <p>No payments attached to this project.</p>
                  ) : (
                    <div className="mini-record-list">
                      {relatedPayments.slice(0, 5).map((payment) => (
                        <div key={payment.id} className="mini-record-card">
                          <strong>{formatMoneyFromCents(payment.amountCents)}</strong>
                          <span>
                            {formatValue(payment.paymentType)} ·{" "}
                            {formatValue(payment.paymentMethod)}
                          </span>
                          <span>{formatDate(payment.receivedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="admin-card admin-project-related-card admin-project-related-wide">
                  <div className="panel-heading">
                    <h2>Timeline</h2>
                    <p>{relatedTimelineEntries.length}</p>
                  </div>

                  {relatedTimelineEntries.length === 0 ? (
                    <p>No timeline entries attached to this project.</p>
                  ) : (
                    <div className="admin-project-timeline-list">
                      {relatedTimelineEntries.slice(0, 6).map((entry) => (
                        <article key={entry.id} className="admin-project-timeline-card">
                          <strong>{entry.title || "Timeline Entry"}</strong>
                          <span>
                            {getTimelineTypeLabel(entry.entryType)} ·{" "}
                            {formatDate(entry.createdAt)}
                          </span>
                          <p>{entry.body}</p>
                          <small>
                            {entry.clientVisible ? "Client visible" : "Private"}{" "}
                            {entry.important ? "· Important" : ""}
                          </small>
                        </article>
                      ))}
                    </div>
                  )}

                  <div className="portal-card-action">
                    <Link
                      className="button button-secondary"
                      href="/admin/project-timeline"
                    >
                      Open Full Timeline
                    </Link>
                  </div>
                </article>
              </section>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}