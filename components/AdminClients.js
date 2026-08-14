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
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const clientStatusOptions = [
  { value: "lead", label: "Lead" },
  { value: "consulting", label: "Consulting" },
  { value: "quoted", label: "Quoted" },
  { value: "booked", label: "Booked" },
  { value: "active_project", label: "Active Project" },
  { value: "membership_candidate", label: "Membership Candidate" },
  { value: "completed", label: "Completed" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const artistOptions = [
  { value: "not_sure", label: "Not Sure Yet" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
  { value: "no_preference", label: "No Preference" },
];

function timestampToMillis(timestamp) {
  if (!timestamp) return 0;

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
  return record.clientUid || record.clientEmail || record.email || "";
}

function getLatestMillis(items) {
  return items.reduce((latest, item) => {
    const createdAt = timestampToMillis(item.createdAt);
    const updatedAt = timestampToMillis(item.updatedAt);
    const lastMessageAt = timestampToMillis(item.lastMessageAt);

    return Math.max(latest, createdAt, updatedAt, lastMessageAt);
  }, 0);
}

export default function AdminClients() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [clientProfiles, setClientProfiles] = useState([]);
  const [applications, setApplications] = useState([]);
  const [consults, setConsults] = useState([]);
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);

  const [selectedClientKey, setSelectedClientKey] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [clientStatusDraft, setClientStatusDraft] = useState("lead");
  const [preferredArtistDraft, setPreferredArtistDraft] = useState("not_sure");
  const [notesDraft, setNotesDraft] = useState("");

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
          status: "lead",
          adminReview: {},
          clientProfile: null,
          applications: [],
          consults: [],
          projects: [],
          conversations: [],
          latestActivityMillis: 0,
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

    clientProfiles.forEach((profile) => {
      const client = ensureClient(profile);

      if (!client) return;

      client.clientProfile = profile;
      client.clientUid = profile.clientUid || profile.id || client.clientUid;
      client.clientName = profile.clientName || client.clientName;
      client.clientEmail = profile.clientEmail || client.clientEmail;
      client.phone = profile.phone || client.phone;
      client.instagram = profile.instagram || client.instagram;
      client.preferredArtist =
        profile.preferredArtist || client.preferredArtist;
      client.status = profile.status || client.status;
      client.adminReview = profile.adminReview || {};
    });

    applications.forEach((application) => {
      const client = ensureClient(application);

      if (!client) return;

      client.applications.push(application);
    });

    consults.forEach((consult) => {
      const client = ensureClient(consult);

      if (!client) return;

      client.consults.push(consult);
    });

    projects.forEach((project) => {
      const client = ensureClient(project);

      if (!client) return;

      client.projects.push(project);
    });

    conversations.forEach((conversation) => {
      const client = ensureClient(conversation);

      if (!client) return;

      client.conversations.push(conversation);
    });

    return Array.from(clientMap.values())
      .map((client) => {
        const allActivity = [
          client.clientProfile,
          ...client.applications,
          ...client.consults,
          ...client.projects,
          ...client.conversations,
        ].filter(Boolean);

        return {
          ...client,
          latestActivityMillis: getLatestMillis(allActivity),
        };
      })
      .sort((a, b) => b.latestActivityMillis - a.latestActivityMillis);
  }, [clientProfiles, applications, consults, projects, conversations]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.key === selectedClientKey) || null;
  }, [clients, selectedClientKey]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) return true;

      const searchableText = [
        client.clientName,
        client.clientEmail,
        client.phone,
        client.instagram,
        client.preferredArtist,
        client.status,
        client.applications.map((item) => item.project?.tattooIdea).join(" "),
        client.consults.map((item) => item.request?.tattooIdea).join(" "),
        client.projects.map((item) => item.projectName).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [clients, searchText, statusFilter]);

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
      "membershipApplications",
      setApplications,
      "Could not load applications. Check Firestore rules."
    );

    subscribeToCollection(
      "consultRequests",
      setConsults,
      "Could not load consult requests. Check Firestore rules."
    );

    subscribeToCollection(
      "projects",
      setProjects,
      "Could not load projects. Check Firestore rules."
    );

    subscribeToCollection(
      "conversations",
      setConversations,
      "Could not load conversations. Check Firestore rules."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleSelectClient(client) {
    setSelectedClientKey(client.key);
    setClientStatusDraft(client.status || "lead");
    setPreferredArtistDraft(client.preferredArtist || "not_sure");
    setNotesDraft(client.adminReview?.internalNotes || "");
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

  async function saveClientProfile() {
    if (!selectedClient) return;

    if (!selectedClient.clientUid) {
      setActionError("This client does not have a client UID yet.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {

      const clientRef = doc(db, "clients", selectedClient.clientUid);

      const basePayload = {
        clientUid: selectedClient.clientUid,
        clientName: selectedClient.clientName || "",
        clientEmail: selectedClient.clientEmail || "",
        phone: selectedClient.phone || "",
        instagram: selectedClient.instagram || "",
        preferredArtist: preferredArtistDraft,
        status: clientStatusDraft,

        stats: {
          applicationCount: selectedClient.applications.length,
          consultCount: selectedClient.consults.length,
          projectCount: selectedClient.projects.length,
          conversationCount: selectedClient.conversations.length,
        },

        adminReview: {
          internalNotes: notesDraft,
          lastUpdatedBy: user.email,
          lastUpdatedAt: serverTimestamp(),
        },

        updatedAt: serverTimestamp(),
      };

      if (!selectedClient.clientProfile) {
        basePayload.createdAt = serverTimestamp();
      }

      await setDoc(clientRef, basePayload, { merge: true });

      setActionSuccess("Client profile saved.");
    } catch (error) {
      console.error(error);
      setActionError("Could not save this client profile.");
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
          <h1>Clients</h1>

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
          <h1>Clients</h1>
          <p>
            View client profiles built from consults, membership applications,
            projects, and conversations.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/consults">
            Consults
          </Link>

          <Link className="button button-secondary" href="/admin/applications">
            Applications
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
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
            <h2>Clients</h2>
            <p>{filteredClients.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, phone, project..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {clientStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredClients.length === 0 ? (
            <p>No clients found yet.</p>
          ) : (
            <div className="application-list">
              {filteredClients.map((client) => (
                <button
                  key={client.key}
                  type="button"
                  className={
                    selectedClientKey === client.key
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectClient(client)}
                >
                  <div>
                    <strong>{client.clientName || "Unnamed client"}</strong>
                    <span>{client.clientEmail || "No email"}</span>
                  </div>

                  <p>
                    {client.projects[0]?.projectName ||
                      client.consults[0]?.request?.tattooIdea ||
                      client.applications[0]?.project?.tattooIdea ||
                      "No project preview yet."}
                  </p>

                  <div className="application-card-meta">
                    <small>{formatValue(client.status)}</small>
                    <small>
                      {client.projects.length} project
                      {client.projects.length === 1 ? "" : "s"}
                    </small>
                  </div>

                  <small>
                    Latest activity:{" "}
                    {client.latestActivityMillis
                      ? new Date(client.latestActivityMillis).toLocaleString(
                          "en-CA",
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }
                        )
                      : "No date"}
                  </small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          {!selectedClient ? (
            <div className="empty-state">
              <h2>Select a client</h2>

              <p>
                Choose a client to view their consults, applications, projects,
                conversations, and internal admin notes.
              </p>
            </div>
          ) : (
            <>
              <div className="application-detail-header">
                <div>
                  <p className="eyebrow">Client Profile</p>
                  <h2>{selectedClient.clientName || "Unnamed client"}</h2>
                  <p>{selectedClient.clientEmail || "No email"}</p>
                  <p>
                    Latest activity:{" "}
                    {selectedClient.latestActivityMillis
                      ? new Date(
                          selectedClient.latestActivityMillis
                        ).toLocaleString("en-CA", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "No date"}
                  </p>
                </div>

                <div className="application-actions">
                 <Link className="button button-secondary" href="/admin/dashboard">
                    Dashboard
                  </Link>
                  <Link className="button button-secondary" href="/admin/inbox">
                    Inbox
                  </Link>

                  <Link className="button button-secondary" href="/admin/intake">
                    Intake
                  </Link>

                  <Link
                    className="button button-secondary"
                    href="/admin/projects"
                  >
                    Projects
                  </Link>

                  <Link className="button button-secondary" href="/admin/schedule">
                    Schedule
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


                </div>
              </div>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="review-controls">
                <label>
                  Client Status
                  <select
                    value={clientStatusDraft}
                    onChange={(event) =>
                      setClientStatusDraft(event.target.value)
                    }
                    disabled={isSaving}
                  >
                    {clientStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Preferred Artist
                  <select
                    value={preferredArtistDraft}
                    onChange={(event) =>
                      setPreferredArtistDraft(event.target.value)
                    }
                    disabled={isSaving}
                  >
                    {artistOptions.map((artist) => (
                      <option key={artist.value} value={artist.value}>
                        {artist.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client Info</h3>

                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedClient.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedClient.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedClient.phone || "Not provided"}
                  </p>

                  <p>
                    <strong>Instagram:</strong>{" "}
                    {selectedClient.instagram || "Not provided"}
                  </p>

                  <p>
                    <strong>Client UID:</strong>{" "}
                    {selectedClient.clientUid || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Activity Summary</h3>

                  <p>
                    <strong>Consult Requests:</strong>{" "}
                    {selectedClient.consults.length}
                  </p>

                  <p>
                    <strong>Membership Applications:</strong>{" "}
                    {selectedClient.applications.length}
                  </p>

                  <p>
                    <strong>Projects:</strong> {selectedClient.projects.length}
                  </p>

                  <p>
                    <strong>Conversations:</strong>{" "}
                    {selectedClient.conversations.length}
                  </p>

                  <p>
                    <strong>Saved Client Profile:</strong>{" "}
                    {selectedClient.clientProfile ? "Yes" : "Not yet"}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Projects</h3>

                  {selectedClient.projects.length === 0 ? (
                    <p>No projects yet.</p>
                  ) : (
                    <div className="mini-record-list">
                      {selectedClient.projects.map((project) => (
                        <div key={project.id} className="mini-record-card">
                          <strong>{project.projectName || "Unnamed project"}</strong>
                          <span>Status: {formatValue(project.status)}</span>
                          <span>
                            Created: {formatDate(project.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Consult Requests</h3>

                  {selectedClient.consults.length === 0 ? (
                    <p>No consult requests yet.</p>
                  ) : (
                    <div className="mini-record-list">
                      {selectedClient.consults.map((consult) => (
                        <div key={consult.id} className="mini-record-card">
                          <strong>
                            {formatValue(consult.request?.projectType)}
                          </strong>
                          <span>Status: {formatValue(consult.status)}</span>
                          <span>
                            Idea:{" "}
                            {consult.request?.tattooIdea || "Not provided"}
                          </span>
                          <span>
                            Submitted: {formatDate(consult.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Membership Applications</h3>

                  {selectedClient.applications.length === 0 ? (
                    <p>No membership applications yet.</p>
                  ) : (
                    <div className="mini-record-list">
                      {selectedClient.applications.map((application) => (
                        <div key={application.id} className="mini-record-card">
                          <strong>
                            {formatValue(application.budget?.tierInterest)}
                          </strong>
                          <span>Status: {formatValue(application.status)}</span>
                          <span>
                            Idea:{" "}
                            {application.project?.tattooIdea || "Not provided"}
                          </span>
                          <span>
                            Submitted: {formatDate(application.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Conversations</h3>

                  {selectedClient.conversations.length === 0 ? (
                    <p>No conversations yet.</p>
                  ) : (
                    <div className="mini-record-list">
                      {selectedClient.conversations.map((conversation) => (
                        <div
                          key={conversation.id}
                          className="mini-record-card"
                        >
                          <strong>
                            {conversation.subject || "Conversation"}
                          </strong>
                          <span>
                            Inbox: {formatValue(conversation.assignedInbox)}
                          </span>
                          <span>
                            Last message:{" "}
                            {conversation.lastMessagePreview ||
                              "No preview available"}
                          </span>
                          <span>
                            Updated: {formatDate(conversation.lastMessageAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Internal Client Notes</h3>

                  <label>
                    Notes
                    <textarea
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      rows={7}
                      placeholder="Private client notes. Do not show this to the client."
                    />
                  </label>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={saveClientProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Client Profile"}
                  </button>
                </article>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}