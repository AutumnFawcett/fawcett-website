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

const timelineStatusOptions = [
  { value: "open", label: "Open" },
  { value: "important", label: "Important" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
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

function getClientKey(record) {
  return record.clientUid || record.clientEmail || record.email || record.id || "";
}

function getTimelineTypeLabel(type) {
  return timelineTypeOptions.find((option) => option.value === type)?.label || formatValue(type);
}

function getTimelineStatusLabel(status) {
  return timelineStatusOptions.find((option) => option.value === status)?.label || formatValue(status);
}

function getTimelineStatusClass(status) {
  if (status === "completed") {
    return "timeline-status-pill timeline-status-good";
  }

  if (status === "important") {
    return "timeline-status-pill timeline-status-watch";
  }

  if (status === "archived") {
    return "timeline-status-pill timeline-status-muted";
  }

  return "timeline-status-pill";
}

export default function AdminProjectTimeline() {
const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [clientProfiles, setClientProfiles] = useState([]);
  const [consults, setConsults] = useState([]);
  const [applications, setApplications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [timelineEntries, setTimelineEntries] = useState([]);

  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const [entryType, setEntryType] = useState("general_note");
  const [entryStatus, setEntryStatus] = useState("open");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryBody, setEntryBody] = useState("");
  const [clientVisible, setClientVisible] = useState(false);
  const [importantFlag, setImportantFlag] = useState(false);

  const [selectedStatusDraft, setSelectedStatusDraft] = useState("open");
  const [selectedTitleDraft, setSelectedTitleDraft] = useState("");
  const [selectedBodyDraft, setSelectedBodyDraft] = useState("");
  const [selectedClientVisibleDraft, setSelectedClientVisibleDraft] = useState(false);
  const [selectedImportantDraft, setSelectedImportantDraft] = useState(false);

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const clients = useMemo(() => {
    const clientMap = new Map();

    function ensureClient(record) {
      const key = getClientKey(record);

      if (!key) return null;

      if (!clientMap.has(key)) {
        clientMap.set(key, {
          key,
          clientUid: record.clientUid || record.id || "",
          clientName:
            record.clientName ||
            record.fullName ||
            record.name ||
            "Unnamed client",
          clientEmail: record.clientEmail || record.email || "",
          phone: record.phone || "",
          instagram: record.instagram || "",
        });
      }

      const client = clientMap.get(key);

      client.clientUid = client.clientUid || record.clientUid || record.id || "";
      client.clientName =
        record.clientName ||
        record.fullName ||
        record.name ||
        client.clientName ||
        "Unnamed client";
      client.clientEmail =
        record.clientEmail || record.email || client.clientEmail || "";
      client.phone = record.phone || client.phone || "";
      client.instagram = record.instagram || client.instagram || "";

      return client;
    }

    clientProfiles.forEach(ensureClient);
    consults.forEach(ensureClient);
    applications.forEach(ensureClient);
    projects.forEach(ensureClient);
    appointments.forEach(ensureClient);
    payments.forEach(ensureClient);
    timelineEntries.forEach(ensureClient);

    return Array.from(clientMap.values()).sort((a, b) =>
      a.clientName.localeCompare(b.clientName)
    );
  }, [
    clientProfiles,
    consults,
    applications,
    projects,
    appointments,
    payments,
    timelineEntries,
  ]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.key === selectedClientKey) || null;
  }, [clients, selectedClientKey]);

  const availableProjects = useMemo(() => {
    if (!selectedClientKey) return [];

    return projects.filter((project) => {
      return getClientKey(project) === selectedClientKey;
    });
  }, [projects, selectedClientKey]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  const selectedEntry = useMemo(() => {
    return timelineEntries.find((entry) => entry.id === selectedEntryId) || null;
  }, [timelineEntries, selectedEntryId]);

  const relatedAppointments = useMemo(() => {
    if (!selectedClientKey) return [];

    return appointments
      .filter((appointment) => {
        if (selectedProjectId) {
          return appointment.projectId === selectedProjectId;
        }

        return getClientKey(appointment) === selectedClientKey;
      })
      .sort((a, b) => timestampToMillis(b.startAt) - timestampToMillis(a.startAt));
  }, [appointments, selectedClientKey, selectedProjectId]);

  const relatedPayments = useMemo(() => {
    if (!selectedClientKey) return [];

    return payments
      .filter((payment) => {
        if (selectedProjectId) {
          return payment.projectId === selectedProjectId;
        }

        return getClientKey(payment) === selectedClientKey;
      })
      .sort((a, b) => {
        const bTime = timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
        const aTime = timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [payments, selectedClientKey, selectedProjectId]);

  const filteredTimelineEntries = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return timelineEntries
      .filter((entry) => {
        if (selectedClientKey && getClientKey(entry) !== selectedClientKey) {
          return false;
        }

        if (selectedProjectId && entry.projectId !== selectedProjectId) {
          return false;
        }

        if (typeFilter !== "all" && entry.entryType !== typeFilter) {
          return false;
        }

        if (visibilityFilter === "client_visible" && !entry.clientVisible) {
          return false;
        }

        if (visibilityFilter === "private" && entry.clientVisible) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          entry.clientName,
          entry.clientEmail,
          entry.projectName,
          entry.entryType,
          entry.status,
          entry.title,
          entry.body,
          entry.createdBy,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const bTime = timestampToMillis(b.createdAt) || timestampToMillis(b.updatedAt);
        const aTime = timestampToMillis(a.createdAt) || timestampToMillis(a.updatedAt);

        return bTime - aTime;
      });
  }, [
    timelineEntries,
    selectedClientKey,
    selectedProjectId,
    typeFilter,
    visibilityFilter,
    searchText,
  ]);

  const clientTimelineCount = useMemo(() => {
    if (!selectedClientKey) return timelineEntries.length;

    return timelineEntries.filter((entry) => getClientKey(entry) === selectedClientKey).length;
  }, [timelineEntries, selectedClientKey]);

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

    subscribeToCollection("clients", setClientProfiles, "Could not load clients.");
    subscribeToCollection("consultRequests", setConsults, "Could not load consults.");
    subscribeToCollection("membershipApplications", setApplications, "Could not load applications.");
    subscribeToCollection("projects", setProjects, "Could not load projects.");
    subscribeToCollection("appointments", setAppointments, "Could not load appointments.");
    subscribeToCollection("payments", setPayments, "Could not load payments.");
    subscribeToCollection("projectTimeline", setTimelineEntries, "Could not load project timeline.");

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleClientChange(nextClientKey) {
    setSelectedClientKey(nextClientKey);
    setSelectedProjectId("");
    setSelectedEntryId("");
    setActionError("");
    setActionSuccess("");
  }

  function handleSelectEntry(entry) {
    setSelectedEntryId(entry.id);
    setSelectedStatusDraft(entry.status || "open");
    setSelectedTitleDraft(entry.title || "");
    setSelectedBodyDraft(entry.body || "");
    setSelectedClientVisibleDraft(entry.clientVisible === true);
    setSelectedImportantDraft(entry.important === true);
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

  async function createTimelineEntry(event) {
    event.preventDefault();

    if (!selectedClient) {
      setActionError("Choose a client before adding a timeline entry.");
      return;
    }

    if (!selectedClient.clientUid) {
      setActionError("This client does not have a client UID yet.");
      return;
    }

    if (!entryTitle.trim() || !entryBody.trim()) {
      setActionError("Add both a title and note before saving.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      await addDoc(collection(db, "projectTimeline"), {
        clientUid: selectedClient.clientUid,
        clientName: selectedClient.clientName || "",
        clientEmail: selectedClient.clientEmail || "",
        phone: selectedClient.phone || "",
        instagram: selectedClient.instagram || "",

        projectId: selectedProject?.id || null,
        projectName: selectedProject?.projectName || "",

        entryType,
        status: entryStatus,
        title: entryTitle.trim(),
        body: entryBody.trim(),

        clientVisible,
        important: importantFlag,

        createdBy: user.email || "",
        updatedBy: user.email || "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Timeline entry added.");
      setEntryType("general_note");
      setEntryStatus("open");
      setEntryTitle("");
      setEntryBody("");
      setClientVisible(false);
      setImportantFlag(false);
    } catch (error) {
      console.error(error);
      setActionError("Could not create timeline entry.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSelectedEntry() {
    if (!selectedEntry) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const entryRef = doc(db, "projectTimeline", selectedEntry.id);

      await updateDoc(entryRef, {
        status: selectedStatusDraft,
        title: selectedTitleDraft,
        body: selectedBodyDraft,
        clientVisible: selectedClientVisibleDraft,
        important: selectedImportantDraft,
        updatedBy: user.email || "",
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Timeline entry updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update timeline entry.");
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
          <h1>Project Timeline</h1>

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
          <h1>Project Timeline</h1>

          <p>
            Add private admin notes or client-visible updates to a client or
            tattoo project timeline.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/admin/clients">
            Clients
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
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

      <section className="timeline-summary-grid">
        <article className="portal-stat-card">
          <p>Timeline Entries</p>
          <strong>{filteredTimelineEntries.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Client Entries</p>
          <strong>{clientTimelineCount}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Appointments</p>
          <strong>{relatedAppointments.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Payments</p>
          <strong>{relatedPayments.length}</strong>
        </article>
      </section>

      <section className="admin-timeline-layout">
        <aside className="applications-list-panel timeline-sidebar">
          <div className="panel-heading">
            <h2>Client / Project</h2>
            <p>{clients.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Client
              <select
                value={selectedClientKey}
                onChange={(event) => handleClientChange(event.target.value)}
              >
                <option value="">Choose client</option>
                {clients.map((client) => (
                  <option key={client.key} value={client.key}>
                    {client.clientName} — {client.clientEmail}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Project
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={!selectedClientKey}
              >
                <option value="">All client timeline</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.projectName || "Unnamed project"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Search Timeline
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search notes..."
              />
            </label>

            <label>
              Entry Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All types</option>
                {timelineTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Visibility
              <select
                value={visibilityFilter}
                onChange={(event) => setVisibilityFilter(event.target.value)}
              >
                <option value="all">All visibility</option>
                <option value="client_visible">Client visible</option>
                <option value="private">Private admin only</option>
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          <div className="timeline-entry-list">
            {filteredTimelineEntries.length === 0 ? (
              <p>No timeline entries yet.</p>
            ) : (
              filteredTimelineEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={
                    selectedEntryId === entry.id
                      ? "timeline-entry-button timeline-entry-button-active"
                      : "timeline-entry-button"
                  }
                  onClick={() => handleSelectEntry(entry)}
                >
                  <strong>{entry.title || "Timeline Entry"}</strong>
                  <span>{entry.clientName || entry.clientEmail}</span>
                  <span>{entry.projectName || "General client timeline"}</span>

                  <div className="timeline-entry-meta">
                    <small>{getTimelineTypeLabel(entry.entryType)}</small>
                    <small>
                      {entry.clientVisible ? "Client Visible" : "Private"}
                    </small>
                  </div>

                  <small>{formatDate(entry.createdAt)}</small>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="application-detail-panel timeline-main-panel">
          <article className="admin-card timeline-create-card">
            <p className="eyebrow">Add Timeline Entry</p>
            <h2>
              {selectedClient
                ? selectedProject?.projectName ||
                  `${selectedClient.clientName} Timeline`
                : "Choose a client"}
            </h2>

            <form className="timeline-form" onSubmit={createTimelineEntry}>
              <label>
                Entry Type
                <select
                  value={entryType}
                  onChange={(event) => setEntryType(event.target.value)}
                >
                  {timelineTypeOptions.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={entryStatus}
                  onChange={(event) => setEntryStatus(event.target.value)}
                >
                  {timelineStatusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="timeline-form-wide">
                Title
                <input
                  type="text"
                  value={entryTitle}
                  onChange={(event) => setEntryTitle(event.target.value)}
                  placeholder="Example: First consult completed"
                />
              </label>

              <label className="timeline-form-wide">
                Note
                <textarea
                  value={entryBody}
                  onChange={(event) => setEntryBody(event.target.value)}
                  rows={5}
                  placeholder="Add the note, update, reminder, session detail, or project milestone."
                />
              </label>

              <label className="checkbox-label timeline-checkbox">
                <input
                  type="checkbox"
                  checked={clientVisible}
                  onChange={(event) => setClientVisible(event.target.checked)}
                />
                Client visible
              </label>

              <label className="checkbox-label timeline-checkbox">
                <input
                  type="checkbox"
                  checked={importantFlag}
                  onChange={(event) => setImportantFlag(event.target.checked)}
                />
                Mark important
              </label>

              <button
                className="button button-primary timeline-form-wide"
                type="submit"
                disabled={isSaving || !selectedClient}
              >
                {isSaving ? "Saving..." : "Add Timeline Entry"}
              </button>
            </form>
          </article>

          {actionSuccess && <p className="success-message">{actionSuccess}</p>}

          <section className="timeline-detail-grid">
            <article className="admin-card timeline-history-card">
              <div className="panel-heading">
                <h2>Timeline</h2>
                <p>{filteredTimelineEntries.length}</p>
              </div>

              {filteredTimelineEntries.length === 0 ? (
                <p>No entries yet.</p>
              ) : (
                <div className="timeline-full-list">
                  {filteredTimelineEntries.map((entry) => (
                    <article key={entry.id} className="timeline-full-card">
                      <div className="timeline-full-header">
                        <div>
                          <strong>{entry.title}</strong>
                          <span>
                            {getTimelineTypeLabel(entry.entryType)} ·{" "}
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>

                        <div className="timeline-pill-row">
                          <span className={getTimelineStatusClass(entry.status)}>
                            {getTimelineStatusLabel(entry.status)}
                          </span>

                          <span className="timeline-status-pill">
                            {entry.clientVisible
                              ? "Client Visible"
                              : "Private"}
                          </span>
                        </div>
                      </div>

                      <p>{entry.body}</p>

                      {entry.projectName ? (
                        <small>Project: {entry.projectName}</small>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="admin-card timeline-history-card">
              <div className="panel-heading">
                <h2>Related Appointments</h2>
                <p>{relatedAppointments.length}</p>
              </div>

              {relatedAppointments.length === 0 ? (
                <p>No related appointments yet.</p>
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

            <article className="admin-card timeline-history-card">
              <div className="panel-heading">
                <h2>Related Payments</h2>
                <p>{relatedPayments.length}</p>
              </div>

              {relatedPayments.length === 0 ? (
                <p>No related payments yet.</p>
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

            {selectedEntry ? (
              <article className="admin-card timeline-history-card timeline-edit-card">
                <div className="panel-heading">
                  <h2>Edit Selected Entry</h2>
                  <p>{selectedEntry.clientVisible ? "Visible" : "Private"}</p>
                </div>

                <label>
                  Status
                  <select
                    value={selectedStatusDraft}
                    onChange={(event) =>
                      setSelectedStatusDraft(event.target.value)
                    }
                  >
                    {timelineStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Title
                  <input
                    type="text"
                    value={selectedTitleDraft}
                    onChange={(event) =>
                      setSelectedTitleDraft(event.target.value)
                    }
                  />
                </label>

                <label>
                  Note
                  <textarea
                    value={selectedBodyDraft}
                    onChange={(event) =>
                      setSelectedBodyDraft(event.target.value)
                    }
                    rows={6}
                  />
                </label>

                <label className="checkbox-label timeline-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedClientVisibleDraft}
                    onChange={(event) =>
                      setSelectedClientVisibleDraft(event.target.checked)
                    }
                  />
                  Client visible
                </label>

                <label className="checkbox-label timeline-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedImportantDraft}
                    onChange={(event) =>
                      setSelectedImportantDraft(event.target.checked)
                    }
                  />
                  Mark important
                </label>

                <button
                  className="button button-primary"
                  type="button"
                  onClick={saveSelectedEntry}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Entry"}
                </button>
              </article>
            ) : null}
          </section>
        </section>
      </section>
    </main>
  );
}