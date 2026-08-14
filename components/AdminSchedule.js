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

const appointmentStatusOptions = [
  { value: "tentative", label: "Tentative" },
  { value: "booked", label: "Booked" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "reschedule_needed", label: "Reschedule Needed" },
];

const appointmentTypeOptions = [
  { value: "consult", label: "Consult" },
  { value: "tattoo_session", label: "Tattoo Session" },
  { value: "touch_up", label: "Touch-Up" },
  { value: "design_session", label: "Design Session" },
  { value: "pmu", label: "Permanent Makeup" },
  { value: "other", label: "Other" },
];

const artistOptions = [
  { value: "general", label: "General / Undecided", artistId: null },
  { value: "ben", label: "Ben", artistId: "artist_ben" },
  { value: "autumn", label: "Autumn", artistId: "artist_autumn" },
];

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

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

function getClientKey(record) {
  return record.clientUid || record.clientEmail || record.email || record.id || "";
}

function getArtistPayload(artistValue) {
  const artist = artistOptions.find((item) => item.value === artistValue);

  return {
    assignedInbox: artist?.value || "general",
    assignedArtistId: artist?.artistId || null,
  };
}

export default function AdminSchedule() {
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

  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [appointmentClientKey, setAppointmentClientKey] = useState("");
  const [appointmentProjectId, setAppointmentProjectId] = useState("");
  const [appointmentType, setAppointmentType] = useState("consult");
  const [appointmentArtist, setAppointmentArtist] = useState("general");
  const [appointmentDate, setAppointmentDate] = useState(getTodayInputValue());
  const [appointmentStartTime, setAppointmentStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentLocation, setAppointmentLocation] = useState(
    "Fawcett Tattoos & Art Studio"
  );
  const [appointmentNotes, setAppointmentNotes] = useState("");

  const [statusDraft, setStatusDraft] = useState("tentative");
  const [selectedNotesDraft, setSelectedNotesDraft] = useState("");
  const [selectedTitleDraft, setSelectedTitleDraft] = useState("");
  const [selectedLocationDraft, setSelectedLocationDraft] = useState("");

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
          preferredArtist: record.preferredArtist || "not_sure",
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
      client.preferredArtist =
        record.preferredArtist || client.preferredArtist || "not_sure";

      return client;
    }

    clientProfiles.forEach(ensureClient);
    consults.forEach(ensureClient);
    applications.forEach(ensureClient);
    projects.forEach(ensureClient);

    return Array.from(clientMap.values()).sort((a, b) =>
      a.clientName.localeCompare(b.clientName)
    );
  }, [clientProfiles, consults, applications, projects]);

  const selectedAppointment = useMemo(() => {
    return (
      appointments.find(
        (appointment) => appointment.id === selectedAppointmentId
      ) || null
    );
  }, [appointments, selectedAppointmentId]);

  const availableProjects = useMemo(() => {
    if (!appointmentClientKey) return [];

    return projects.filter((project) => {
      return getClientKey(project) === appointmentClientKey;
    });
  }, [projects, appointmentClientKey]);

  const filteredAppointments = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return appointments
      .filter((appointment) => {
        if (
          statusFilter !== "all" &&
          appointment.status !== statusFilter
        ) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          appointment.title,
          appointment.clientName,
          appointment.clientEmail,
          appointment.phone,
          appointment.projectName,
          appointment.appointmentType,
          appointment.status,
          appointment.assignedInbox,
          appointment.adminReview?.internalNotes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort(
        (a, b) =>
          timestampToMillis(a.startAt) - timestampToMillis(b.startAt)
      );
  }, [appointments, searchText, statusFilter]);

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

    subscribeToCollection(
      "clients",
      setClientProfiles,
      "Could not load clients. Check Firestore rules."
    );

    subscribeToCollection(
      "consultRequests",
      setConsults,
      "Could not load consult requests. Check Firestore rules."
    );

    subscribeToCollection(
      "membershipApplications",
      setApplications,
      "Could not load applications. Check Firestore rules."
    );

    subscribeToCollection(
      "projects",
      setProjects,
      "Could not load projects. Check Firestore rules."
    );

    subscribeToCollection(
      "appointments",
      setAppointments,
      "Could not load appointments. Check Firestore rules."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleSelectAppointment(appointment) {
    setSelectedAppointmentId(appointment.id);
    setStatusDraft(appointment.status || "tentative");
    setSelectedNotesDraft(appointment.adminReview?.internalNotes || "");
    setSelectedTitleDraft(appointment.title || "");
    setSelectedLocationDraft(appointment.location || "");
    setActionError("");
    setActionSuccess("");
  }

  function handleClientChange(nextClientKey) {
    setAppointmentClientKey(nextClientKey);
    setAppointmentProjectId("");

    const client = clients.find((item) => item.key === nextClientKey);

    if (client?.preferredArtist === "ben") {
      setAppointmentArtist("ben");
    } else if (client?.preferredArtist === "autumn") {
      setAppointmentArtist("autumn");
    } else {
      setAppointmentArtist("general");
    }
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

  async function createAppointment(event) {
    event.preventDefault();

    const client = clients.find((item) => item.key === appointmentClientKey);

    if (!client) {
      setActionError("Choose a client before creating an appointment.");
      return;
    }

    if (!client.clientUid) {
      setActionError(
        "This client does not have a client UID yet. Save their client profile first."
      );
      return;
    }

    const durationNumber = Number(durationMinutes);

    if (!appointmentDate || !appointmentStartTime || !durationNumber) {
      setActionError("Add a date, start time, and duration.");
      return;
    }

    const startAt = new Date(`${appointmentDate}T${appointmentStartTime}:00`);

    if (Number.isNaN(startAt.getTime())) {
      setActionError("The appointment date or time is invalid.");
      return;
    }

    const endAt = new Date(startAt.getTime() + durationNumber * 60 * 1000);

    const selectedProject = projects.find(
      (project) => project.id === appointmentProjectId
    );

    const artistPayload = getArtistPayload(appointmentArtist);

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      await addDoc(collection(db, "appointments"), {
        clientUid: client.clientUid,
        clientName: client.clientName || "",
        clientEmail: client.clientEmail || "",
        phone: client.phone || "",
        instagram: client.instagram || "",

        projectId: selectedProject?.id || null,
        projectName: selectedProject?.projectName || "",

        title:
          appointmentTitle.trim() ||
          `${formatValue(appointmentType)} - ${client.clientName}`,

        appointmentType,
        status: "tentative",

        assignedInbox: artistPayload.assignedInbox,
        assignedArtistId: artistPayload.assignedArtistId,

        startAt,
        endAt,
        durationMinutes: durationNumber,

        location: appointmentLocation.trim(),
        clientVisibleNotes: "",
        adminReview: {
          internalNotes: appointmentNotes.trim(),
          createdBy: user.email,
          createdAt: serverTimestamp(),
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Appointment created.");
      setAppointmentTitle("");
      setAppointmentNotes("");
      setAppointmentProjectId("");
      setAppointmentType("consult");
      setAppointmentDate(getTodayInputValue());
      setAppointmentStartTime("10:00");
      setDurationMinutes("60");
    } catch (error) {
      console.error(error);
      setActionError("Could not create appointment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSelectedAppointment() {
    if (!selectedAppointment) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const appointmentRef = doc(
        db,
        "appointments",
        selectedAppointment.id
      );

      await updateDoc(appointmentRef, {
        status: statusDraft,
        title: selectedTitleDraft,
        location: selectedLocationDraft,
        "adminReview.internalNotes": selectedNotesDraft,
        "adminReview.lastUpdatedBy": user.email,
        "adminReview.lastUpdatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Appointment updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update appointment.");
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
          <h1>Schedule</h1>

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
          <h1>Schedule</h1>
          <p>
            Manually create and track consults, tattoo sessions, touch-ups, and
            project appointments.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/clients">
            Clients
          </Link>

          <Link className="button button-secondary" href="/admin/consults">
            Consults
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
          </Link>

          <Link className="button button-secondary" href="/admin/project-timeline">
             Timeline
          </Link>

          <Link className="button button-secondary" href="/admin/payments">
            Payments
          </Link>

          <Link className="button button-secondary" href="/admin/credit-ledger">
            Credit Ledger
          </Link>

          <Link className="button button-secondary" href="/admin/membership-offers">
            Membership Offers
          </Link>

          <Link className="button button-secondary" href="/admin/membership-requests">
            Membership Requests
          </Link>

          <Link className="button button-secondary" href="/admin/membership-offer-responses">
            Offer Responses
          </Link>
          <Link className="button button-secondary" href="/admin/dashboard">
            Dashboard
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

      <section className="admin-applications-layout">
        <aside className="applications-list-panel">
          <div className="panel-heading">
            <h2>Appointments</h2>
            <p>{filteredAppointments.length}</p>
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
                {appointmentStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredAppointments.length === 0 ? (
            <p>No appointments yet.</p>
          ) : (
            <div className="application-list">
              {filteredAppointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className={
                    selectedAppointmentId === appointment.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectAppointment(appointment)}
                >
                  <div>
                    <strong>{appointment.title || "Appointment"}</strong>
                    <span>{appointment.clientEmail}</span>
                  </div>

                  <p>
                    {formatDate(appointment.startAt)} ·{" "}
                    {appointment.durationMinutes || 0} minutes
                  </p>

                  <div className="application-card-meta">
                    <small>{formatValue(appointment.status)}</small>
                    <small>{formatValue(appointment.assignedInbox)}</small>
                  </div>

                  <small>{appointment.clientName}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          <article className="admin-card schedule-create-card">
            <p className="eyebrow">Create Appointment</p>
            <h2>Book a client into the studio schedule</h2>

           <form className="admin-form schedule-form" onSubmit={createAppointment}>
              <label>
                Client
                <select
                  value={appointmentClientKey}
                  onChange={(event) => handleClientChange(event.target.value)}
                  required
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
                Related Project
                <select
                  value={appointmentProjectId}
                  onChange={(event) =>
                    setAppointmentProjectId(event.target.value)
                  }
                >
                  <option value="">No project selected</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectName || "Unnamed project"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Appointment Type
                <select
                  value={appointmentType}
                  onChange={(event) =>
                    setAppointmentType(event.target.value)
                  }
                >
                  {appointmentTypeOptions.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Artist / Inbox
                <select
                  value={appointmentArtist}
                  onChange={(event) =>
                    setAppointmentArtist(event.target.value)
                  }
                >
                  {artistOptions.map((artist) => (
                    <option key={artist.value} value={artist.value}>
                      {artist.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Date
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(event) =>
                    setAppointmentDate(event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Start Time
                <input
                  type="time"
                  value={appointmentStartTime}
                  onChange={(event) =>
                    setAppointmentStartTime(event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Duration Minutes
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={durationMinutes}
                  onChange={(event) =>
                    setDurationMinutes(event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Title
                <input
                  type="text"
                  value={appointmentTitle}
                  onChange={(event) =>
                    setAppointmentTitle(event.target.value)
                  }
                  placeholder="Optional. Example: Sleeve Consult"
                />
              </label>

              <label>
                Location
                <input
                  type="text"
                  value={appointmentLocation}
                  onChange={(event) =>
                    setAppointmentLocation(event.target.value)
                  }
                />
              </label>

              <label>
                Internal Notes
                <textarea
                  value={appointmentNotes}
                  onChange={(event) =>
                    setAppointmentNotes(event.target.value)
                  }
                  rows={4}
                  placeholder="Private admin notes for this appointment."
                />
              </label>

              <button
                className="button button-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Creating..." : "Create Appointment"}
              </button>
            </form>
          </article>

          {!selectedAppointment ? (
            <div className="empty-state">
              <h2>Select an appointment</h2>
              <p>
                Choose an appointment from the list to update status, title,
                location, and internal notes.
              </p>
            </div>
          ) : (
            <article className="admin-card schedule-selected-card">
              <p className="eyebrow">Appointment Details</p>
              <h2>{selectedAppointment.title || "Appointment"}</h2>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client</h3>

                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedAppointment.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedAppointment.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedAppointment.phone || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Time</h3>

                  <p>
                    <strong>Start:</strong>{" "}
                    {formatDate(selectedAppointment.startAt)}
                  </p>

                  <p>
                    <strong>End:</strong>{" "}
                    {formatDate(selectedAppointment.endAt)}
                  </p>

                  <p>
                    <strong>Duration:</strong>{" "}
                    {selectedAppointment.durationMinutes || 0} minutes
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Edit Appointment</h3>

                  <label>
                    Status
                    <select
                      value={statusDraft}
                      onChange={(event) =>
                        setStatusDraft(event.target.value)
                      }
                      disabled={isSaving}
                    >
                      {appointmentStatusOptions.map((status) => (
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
                    Location
                    <input
                      type="text"
                      value={selectedLocationDraft}
                      onChange={(event) =>
                        setSelectedLocationDraft(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Internal Notes
                    <textarea
                      value={selectedNotesDraft}
                      onChange={(event) =>
                        setSelectedNotesDraft(event.target.value)
                      }
                      rows={5}
                    />
                  </label>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={saveSelectedAppointment}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Appointment"}
                  </button>
                </article>
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}