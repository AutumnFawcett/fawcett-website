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

const consultStatusOptions = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "needs_more_info", label: "Needs More Info" },
  { value: "good_fit", label: "Good Fit" },
  { value: "not_fit", label: "Not a Fit" },
  { value: "consult_offered", label: "Consult Offered" },
  { value: "consult_booked", label: "Consult Booked" },
  { value: "estimate_needed", label: "Estimate Needed" },
  { value: "estimate_sent", label: "Estimate Sent" },
  { value: "project_created", label: "Project Created" },
  { value: "declined", label: "Declined" },
  { value: "closed", label: "Closed" },
];

const inboxOptions = [
  { value: "general", label: "General / Undecided" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
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

function getStatusLabel(status) {
  return (
    consultStatusOptions.find((item) => item.value === status)?.label ||
    formatValue(status)
  );
}

function getInboxPayload(nextInbox) {
  if (nextInbox === "ben") {
    return {
      assignedInbox: "ben",
      assignedArtistId: "artist_ben",
      preferredArtist: "ben",
    };
  }

  if (nextInbox === "autumn") {
    return {
      assignedInbox: "autumn",
      assignedArtistId: "artist_autumn",
      preferredArtist: "autumn",
    };
  }

  return {
    assignedInbox: "general",
    assignedArtistId: null,
  };
}

export default function AdminConsults() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [consults, setConsults] = useState([]);
  const [selectedConsultId, setSelectedConsultId] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [notesDraft, setNotesDraft] = useState("");
  const [reviewSummaryDraft, setReviewSummaryDraft] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedConsult = useMemo(() => {
    return consults.find((consult) => consult.id === selectedConsultId) || null;
  }, [consults, selectedConsultId]);

  const filteredConsults = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return consults
      .filter((consult) => {
        if (statusFilter !== "all" && consult.status !== statusFilter) {
          return false;
        }

        if (inboxFilter !== "all" && consult.assignedInbox !== inboxFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          consult.clientName,
          consult.clientEmail,
          consult.phone,
          consult.instagram,
          consult.request?.tattooIdea,
          consult.request?.placement,
          consult.request?.projectType,
          consult.request?.budgetRange,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort(
        (a, b) =>
          timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
      );
  }, [consults, statusFilter, inboxFilter, searchText]);

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

    const consultsQuery = query(collection(db, "consultRequests"));

    const unsubscribe = onSnapshot(
      consultsQuery,
      (snapshot) => {
        const nextConsults = snapshot.docs.map((consultDoc) => ({
          id: consultDoc.id,
          ...consultDoc.data(),
        }));

        setConsults(nextConsults);
        setActionError("");
      },
      (error) => {
        console.error(error);
        setActionError("Could not load consult requests. Check Firestore rules.");
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  function handleSelectConsult(consult) {
    setSelectedConsultId(consult.id);
    setNotesDraft(consult.adminReview?.internalNotes || "");
    setReviewSummaryDraft(consult.adminReview?.reviewSummary || "");
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

  async function updateConsult(updates, successMessage) {
    if (!selectedConsult) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const consultRef = doc(db, "consultRequests", selectedConsult.id);

      await updateDoc(consultRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      setActionSuccess(successMessage || "Consult updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update this consult request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(nextStatus) {
    await updateConsult(
      {
        status: nextStatus,
        "adminReview.lastReviewedBy": user.email,
        "adminReview.lastReviewedAt": serverTimestamp(),
      },
      "Status updated."
    );
  }

  async function handleInboxChange(nextInbox) {
    const inboxPayload = getInboxPayload(nextInbox);

    await updateConsult(
      {
        ...inboxPayload,
        "adminReview.lastReviewedBy": user.email,
        "adminReview.lastReviewedAt": serverTimestamp(),
      },
      "Artist / inbox assignment updated."
    );
  }

  async function saveNotes() {
    await updateConsult(
      {
        "adminReview.internalNotes": notesDraft,
        "adminReview.reviewSummary": reviewSummaryDraft,
        "adminReview.lastReviewedBy": user.email,
        "adminReview.lastReviewedAt": serverTimestamp(),
      },
      "Admin notes saved."
    );
  }

  async function createProjectFromConsult() {
    if (!selectedConsult) return;

    if (selectedConsult.projectId) {
      setActionError("This consult already has a project record.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const projectType =
        selectedConsult.request?.projectType || "tattoo_project";

      const clientName = selectedConsult.clientName || "Unnamed Client";

      const projectRef = await addDoc(collection(db, "projects"), {
        clientUid: selectedConsult.clientUid,
        clientName: selectedConsult.clientName || "",
        clientEmail: selectedConsult.clientEmail || "",
        phone: selectedConsult.phone || "",
        instagram: selectedConsult.instagram || "",

        consultRequestId: selectedConsult.id,
        applicationId: null,

        projectName: `${clientName} - ${formatValue(projectType)}`,

        status: "review",

        assignedInbox: selectedConsult.assignedInbox || "general",
        assignedArtistId: selectedConsult.assignedArtistId || null,
        preferredArtist: selectedConsult.preferredArtist || "not_sure",

        source: {
          sourceType: "consultRequest",
          sourceId: selectedConsult.id,
        },

        membership: {
          tierInterest: "none",
          monthlyComfort: "",
          paymentStyle: "",
          membershipStatus: "not_applicable",
        },

        project: {
          projectType: selectedConsult.request?.projectType || "",
          tattooIdea: selectedConsult.request?.tattooIdea || "",
          colourPreference: selectedConsult.request?.colourPreference || "",
          placement: selectedConsult.request?.placement || "",
          bodySide: selectedConsult.request?.bodySide || "",
          sizeCategory: selectedConsult.request?.approximateSize || "",
          detailLevel: selectedConsult.request?.styleDirection || "",
          budgetRange: selectedConsult.request?.budgetRange || "",
          referenceLinks: selectedConsult.request?.referenceLinks || "",
        },

        coverUp: {
          isCoverUp: selectedConsult.coverUp?.isCoverUp || "no",
          coverUpDescription:
            selectedConsult.coverUp?.coverUpDescription || "",
        },

        timeline: {
          planningTimeline: selectedConsult.timeline?.timeline || "",
          completionWindow: "",
          availability: selectedConsult.request?.availability || "",
          isUrgent: selectedConsult.timeline?.isUrgent || "no",
        },

        readiness: {
          readyForConsult: "yes",
          healthConsiderations: selectedConsult.readiness?.healthNotes
            ? "notes_provided"
            : "not_provided",
          healthDetails: selectedConsult.readiness?.healthNotes || "",
        },

        estimate: {
          estimateLowCents: null,
          estimateHighCents: null,
          estimatedSessions: null,
          estimatedHours: null,
          hourlyRateCents: 20000,
        },

        mandatoryCosts: {
          tattooTimeDisclosed: false,
          suppliesDisclosed: false,
          gstDisclosed: false,
          depositDisclosed: false,
          bookingFeeDisclosed: false,
          drawingFeeDisclosed: false,
          processingFeeDisclosed: false,
          otherCostsDisclosed: false,
        },

        adminReview: {
          createdFromConsult: true,
          createdBy: user.email,
          internalNotes: selectedConsult.adminReview?.internalNotes || "",
          reviewSummary: selectedConsult.adminReview?.reviewSummary || "",
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const consultRef = doc(db, "consultRequests", selectedConsult.id);

      await updateDoc(consultRef, {
        projectId: projectRef.id,
        status: "project_created",
        "adminReview.projectCreatedBy": user.email,
        "adminReview.projectCreatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Project record created from consult.");
    } catch (error) {
      console.error(error);
      setActionError("Could not create project record.");
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
          <h1>Consults</h1>

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
          <h1>Consults</h1>
          <p>
            Review regular tattoo consult requests, assign artists, message
            clients, and create project records.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/dashboard">
            Dashboard
          </Link>
          
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/intake">
            Intake
          </Link>


          <Link className="button button-secondary" href="/admin/applications">
            Applications
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
          </Link>

          <Link className="button button-secondary" href="/admin/clients">
            Clients
          </Link>
          <Link className="button button-secondary" href="/admin/schedule">
            Schedule
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
            <h2>Consults</h2>
            <p>{filteredConsults.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, tattoo idea..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {consultStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Inbox
              <select
                value={inboxFilter}
                onChange={(event) => setInboxFilter(event.target.value)}
              >
                <option value="all">All inboxes</option>
                {inboxOptions.map((inbox) => (
                  <option key={inbox.value} value={inbox.value}>
                    {inbox.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredConsults.length === 0 ? (
            <p>No consult requests found.</p>
          ) : (
            <div className="application-list">
              {filteredConsults.map((consult) => (
                <button
                  key={consult.id}
                  type="button"
                  className={
                    selectedConsultId === consult.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectConsult(consult)}
                >
                  <div>
                    <strong>{consult.clientName || "Unnamed client"}</strong>
                    <span>{consult.clientEmail}</span>
                  </div>

                  <p>
                    {consult.request?.tattooIdea?.slice(0, 120) ||
                      "No tattoo idea preview."}
                  </p>

                  <div className="application-card-meta">
                    <small>{formatValue(consult.request?.projectType)}</small>
                    <small>{getStatusLabel(consult.status || "new")}</small>
                  </div>

                  <small>{formatDate(consult.createdAt)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          {!selectedConsult ? (
            <div className="empty-state">
              <h2>Select a consult</h2>

              <p>
                Choose a consult request from the list to review the client,
                tattoo idea, budget, timeline, and readiness details.
              </p>
            </div>
          ) : (
            <>
              <div className="application-detail-header">
                <div>
                  <p className="eyebrow">Consult Review</p>
                  <h2>{selectedConsult.clientName || "Unnamed client"}</h2>
                  <p>{selectedConsult.clientEmail}</p>
                  <p>Submitted: {formatDate(selectedConsult.createdAt)}</p>
                </div>

                <div className="application-actions">
                  <Link className="button button-secondary" href="/admin/inbox">
                    Open Inbox
                  </Link>

                  <Link
                    className="button button-secondary"
                    href="/admin/projects"
                  >
                    Projects
                  </Link>

                  {selectedConsult.projectId ? (
                    <span className="project-created-pill">Project Created</span>
                  ) : (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={createProjectFromConsult}
                      disabled={isSaving}
                    >
                      {isSaving ? "Creating..." : "Create Project Record"}
                    </button>
                  )}
                </div>
              </div>

              <div className="review-controls">
                <label>
                  Consult Status
                  <select
                    value={selectedConsult.status || "new"}
                    onChange={(event) => handleStatusChange(event.target.value)}
                    disabled={isSaving}
                  >
                    {consultStatusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Assigned Inbox / Artist
                  <select
                    value={selectedConsult.assignedInbox || "general"}
                    onChange={(event) => handleInboxChange(event.target.value)}
                    disabled={isSaving}
                  >
                    {inboxOptions.map((inbox) => (
                      <option key={inbox.value} value={inbox.value}>
                        {inbox.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client Info</h3>

                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedConsult.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedConsult.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedConsult.phone || "Not provided"}
                  </p>

                  <p>
                    <strong>Instagram:</strong>{" "}
                    {selectedConsult.instagram || "Not provided"}
                  </p>

                  <p>
                    <strong>Contact:</strong>{" "}
                    {formatValue(selectedConsult.preferredContactMethod)}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Artist / Assignment</h3>

                  <p>
                    <strong>Preferred Artist:</strong>{" "}
                    {formatValue(selectedConsult.preferredArtist)}
                  </p>

                  <p>
                    <strong>Assigned Inbox:</strong>{" "}
                    {formatValue(selectedConsult.assignedInbox || "general")}
                  </p>

                  <p>
                    <strong>Assigned Artist ID:</strong>{" "}
                    {selectedConsult.assignedArtistId || "Not assigned"}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Tattoo Request</h3>

                  <p>
                    <strong>Project Type:</strong>{" "}
                    {formatValue(selectedConsult.request?.projectType)}
                  </p>

                  <p>
                    <strong>Placement:</strong>{" "}
                    {selectedConsult.request?.placement || "Not provided"}
                  </p>

                  <p>
                    <strong>Body Side:</strong>{" "}
                    {formatValue(selectedConsult.request?.bodySide)}
                  </p>

                  <p>
                    <strong>Approximate Size:</strong>{" "}
                    {selectedConsult.request?.approximateSize ||
                      "Not provided"}
                  </p>

                  <p>
                    <strong>Colour:</strong>{" "}
                    {formatValue(selectedConsult.request?.colourPreference)}
                  </p>

                  <p>
                    <strong>Style:</strong>{" "}
                    {selectedConsult.request?.styleDirection || "Not provided"}
                  </p>

                  <p>
                    <strong>Budget:</strong>{" "}
                    {selectedConsult.request?.budgetRange || "Not provided"}
                  </p>

                  <p className="pre-wrap">
                    <strong>Idea:</strong>{" "}
                    {selectedConsult.request?.tattooIdea || "Not provided"}
                  </p>

                  <p className="pre-wrap">
                    <strong>Reference Links:</strong>{" "}
                    {selectedConsult.request?.referenceLinks || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Cover-Up Info</h3>

                  <p>
                    <strong>Cover-Up:</strong>{" "}
                    {formatValue(selectedConsult.coverUp?.isCoverUp)}
                  </p>

                  <p className="pre-wrap">
                    <strong>Description:</strong>{" "}
                    {selectedConsult.coverUp?.coverUpDescription ||
                      "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Timeline</h3>

                  <p>
                    <strong>Timeline:</strong>{" "}
                    {formatValue(selectedConsult.timeline?.timeline)}
                  </p>

                  <p>
                    <strong>Urgent:</strong>{" "}
                    {formatValue(selectedConsult.timeline?.isUrgent)}
                  </p>

                  <p className="pre-wrap">
                    <strong>Availability:</strong>{" "}
                    {selectedConsult.request?.availability || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Health / Readiness</h3>

                  <p className="pre-wrap">
                    <strong>Notes:</strong>{" "}
                    {selectedConsult.readiness?.healthNotes || "Not provided"}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Acknowledgements</h3>

                  <div className="ack-grid">
                    <p>
                      Accurate Info:{" "}
                      {formatValue(
                        selectedConsult.acknowledgements
                          ?.acknowledgementAccurate
                      )}
                    </p>

                    <p>
                      No Guarantee:{" "}
                      {formatValue(
                        selectedConsult.acknowledgements
                          ?.acknowledgementNoGuarantee
                      )}
                    </p>

                    <p>
                      Studio Policy:{" "}
                      {formatValue(
                        selectedConsult.acknowledgements
                          ?.acknowledgementPolicy
                      )}
                    </p>
                  </div>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Admin Review Notes</h3>

                  <label>
                    Review Summary
                    <input
                      type="text"
                      value={reviewSummaryDraft}
                      onChange={(event) =>
                        setReviewSummaryDraft(event.target.value)
                      }
                      placeholder="Example: Good fit for Autumn, small custom, needs consult."
                    />
                  </label>

                  <label>
                    Internal Notes
                    <textarea
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      rows={6}
                      placeholder="Private admin notes. Do not show this to client."
                    />
                  </label>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={saveNotes}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Notes"}
                  </button>

                  <p className="small-admin-note">
                    Last reviewed by:{" "}
                    {selectedConsult.adminReview?.lastReviewedBy ||
                      "Not reviewed yet"}
                  </p>
                </article>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}