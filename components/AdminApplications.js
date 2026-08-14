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

const statusOptions = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "needs_more_info", label: "Needs More Info" },
  { value: "good_fit", label: "Good Fit" },
  { value: "not_fit", label: "Not a Fit" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "consult_offered", label: "Consult Offered" },
  { value: "consult_booked", label: "Consult Booked" },
  { value: "estimate_needed", label: "Estimate Needed" },
  { value: "estimate_sent", label: "Estimate Sent" },
  { value: "project_created", label: "Project Created" },
  { value: "approved_for_terms", label: "Approved for Terms" },
  { value: "declined", label: "Declined" },
  { value: "closed", label: "Closed" },
  
];

const inboxOptions = [
  { value: "general", label: "General / Undecided" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
];

const tierLabels = {
  starter: "Starter Member",
  builder: "Builder Member",
  commitment: "Commitment Member",
  custom: "Custom Project Review",
  not_sure: "Not Sure Yet",
};

const artistLabels = {
  ben: "Ben",
  autumn: "Autumn",
  no_preference: "No Preference",
  not_sure: "Not Sure Yet",
};

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
  if (value === null || value === undefined || value === "") return "Not provided";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusLabel(status) {
  return statusOptions.find((item) => item.value === status)?.label || formatValue(status);
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

export default function AdminApplications() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [notesDraft, setNotesDraft] = useState("");
  const [reviewSummaryDraft, setReviewSummaryDraft] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedApplication = useMemo(() => {
    return applications.find((application) => application.id === selectedApplicationId) || null;
  }, [applications, selectedApplicationId]);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return applications
      .filter((application) => {
        if (statusFilter !== "all" && application.status !== statusFilter) {
          return false;
        }

        if (inboxFilter !== "all" && application.assignedInbox !== inboxFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const searchableText = [
          application.clientName,
          application.clientEmail,
          application.phone,
          application.instagram,
          application.project?.tattooIdea,
          application.project?.placement,
          application.project?.projectType,
          application.budget?.tierInterest,
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
  }, [applications, statusFilter, inboxFilter, searchText]);

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

    const applicationsQuery = query(collection(db, "membershipApplications"));

    const unsubscribe = onSnapshot(
      applicationsQuery,
      (snapshot) => {
        const nextApplications = snapshot.docs.map((applicationDoc) => ({
          id: applicationDoc.id,
          ...applicationDoc.data(),
        }));

        setApplications(nextApplications);
        setActionError("");
      },
      (error) => {
        console.error(error);
        setActionError("Could not load applications. Check Firestore rules.");
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  function handleSelectApplication(application) {
    setSelectedApplicationId(application.id);
    setNotesDraft(application.adminReview?.internalNotes || "");
    setReviewSummaryDraft(application.adminReview?.reviewSummary || "");
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

  async function updateApplication(updates, successMessage) {
    if (!selectedApplication) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const applicationRef = doc(db, "membershipApplications", selectedApplication.id);

      await updateDoc(applicationRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      setActionSuccess(successMessage || "Application updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update this application.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(nextStatus) {
    await updateApplication(
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

    await updateApplication(
      {
        ...inboxPayload,
        "adminReview.lastReviewedBy": user.email,
        "adminReview.lastReviewedAt": serverTimestamp(),
      },
      "Artist / inbox assignment updated."
    );
  }

  async function saveNotes() {
    await updateApplication(
      {
        "adminReview.internalNotes": notesDraft,
        "adminReview.reviewSummary": reviewSummaryDraft,
        "adminReview.lastReviewedBy": user.email,
        "adminReview.lastReviewedAt": serverTimestamp(),
      },
      "Admin notes saved."
    );
  }

  async function createProjectFromApplication() {
  if (!selectedApplication) return;

  if (selectedApplication.projectId) {
    setActionError("This application already has a project record.");
    return;
  }

  setIsSaving(true);
  setActionError("");
  setActionSuccess("");

  try {
    const projectType =
      selectedApplication.project?.projectType || "tattoo_project";

    const clientName = selectedApplication.clientName || "Unnamed Client";

    const projectRef = await addDoc(collection(db, "projects"), {
      clientUid: selectedApplication.clientUid,
      clientName: selectedApplication.clientName || "",
      clientEmail: selectedApplication.clientEmail || "",
      phone: selectedApplication.phone || "",
      instagram: selectedApplication.instagram || "",

      applicationId: selectedApplication.id,

      projectName: `${clientName} - ${formatValue(projectType)}`,

      status: "review",

      assignedInbox: selectedApplication.assignedInbox || "general",
      assignedArtistId: selectedApplication.assignedArtistId || null,
      preferredArtist: selectedApplication.preferredArtist || "not_sure",

      membership: {
        tierInterest: selectedApplication.budget?.tierInterest || "not_sure",
        monthlyComfort: selectedApplication.budget?.monthlyComfort || "",
        paymentStyle: selectedApplication.budget?.paymentStyle || "",
        membershipStatus: "not_started",
      },

      project: {
        projectType: selectedApplication.project?.projectType || "",
        tattooIdea: selectedApplication.project?.tattooIdea || "",
        colourPreference: selectedApplication.project?.colourPreference || "",
        placement: selectedApplication.project?.placement || "",
        bodySide: selectedApplication.project?.bodySide || "",
        sizeCategory: selectedApplication.project?.sizeCategory || "",
        detailLevel: selectedApplication.project?.detailLevel || "",
      },

      coverUp: {
        isCoverUp: selectedApplication.coverUp?.isCoverUp || "no",
        coverUpDescription:
          selectedApplication.coverUp?.coverUpDescription || "",
      },

      timeline: {
        planningTimeline: selectedApplication.timeline?.planningTimeline || "",
        completionWindow: selectedApplication.timeline?.completionWindow || "",
        availability: selectedApplication.timeline?.availability || "",
      },

      readiness: {
        readyForConsult: selectedApplication.readiness?.readyForConsult || "",
        healthConsiderations:
          selectedApplication.readiness?.healthConsiderations || "",
        healthDetails: selectedApplication.readiness?.healthDetails || "",
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
        createdFromApplication: true,
        createdBy: user.email,
        internalNotes: selectedApplication.adminReview?.internalNotes || "",
        reviewSummary: selectedApplication.adminReview?.reviewSummary || "",
      },

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const applicationRef = doc(
      db,
      "membershipApplications",
      selectedApplication.id
    );

    await updateDoc(applicationRef, {
      projectId: projectRef.id,
      status: "project_created",
      "adminReview.projectCreatedBy": user.email,
      "adminReview.projectCreatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setActionSuccess("Project record created.");
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
          <h1>Applications</h1>

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
          <h1>Applications</h1>
          <p>
            Review Tattoo Project Membership applications, assign them to Ben or
            Autumn, and track next steps.
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
          <Link className="button button-secondary" href="/admin/consults">
            Consults
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
      <h2>Applications</h2>
      <p>{filteredApplications.length}</p>
    </div>

    <div className="admin-filters">
      <label>
        Search
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Name, email, tier, project..."
        />
      </label>

      <label>
        Status
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
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

    {filteredApplications.length === 0 ? (
      <p>No applications found.</p>
    ) : (
      <div className="application-list">
        {filteredApplications.map((application) => (
          <button
            key={application.id}
            type="button"
            className={
              selectedApplicationId === application.id
                ? "application-card application-card-active"
                : "application-card"
            }
            onClick={() => handleSelectApplication(application)}
          >
            <div>
              <strong>{application.clientName || "Unnamed client"}</strong>
              <span>{application.clientEmail}</span>
            </div>

            <p>
              {application.project?.tattooIdea?.slice(0, 120) ||
                "No tattoo idea preview."}
            </p>

            <div className="application-card-meta">
              <small>
                {tierLabels[application.budget?.tierInterest] ||
                  formatValue(application.budget?.tierInterest)}
              </small>

              <small>{getStatusLabel(application.status || "new")}</small>
            </div>

            <small>{formatDate(application.createdAt)}</small>
          </button>
        ))}
      </div>
    )}
  </aside>

  <section className="application-detail-panel">
    {!selectedApplication ? (
      <div className="empty-state">
        <h2>Select an application</h2>

        <p>
          Choose an application from the list to review the client, project,
          budget, timeline, and readiness details.
        </p>
      </div>
    ) : (
      <>
        <div className="application-detail-header">
          <div>
            <p className="eyebrow">Application Review</p>
            <h2>{selectedApplication.clientName || "Unnamed client"}</h2>
            <p>{selectedApplication.clientEmail}</p>
            <p>Submitted: {formatDate(selectedApplication.createdAt)}</p>
          </div>

          <div className="application-actions">
            <Link className="button button-secondary" href="/admin/inbox">
              Open Inbox
            </Link>

            <Link className="button button-secondary" href="/admin/projects">
              Projects
            </Link>

            {selectedApplication.projectId ? (
              <span className="project-created-pill">Project Created</span>
            ) : (
              <button
                className="button button-primary"
                type="button"
                onClick={createProjectFromApplication}
                disabled={isSaving}
              >
                {isSaving ? "Creating..." : "Create Project Record"}
              </button>
            )}
          </div>
        </div>

        <div className="review-controls">
          <label>
            Application Status
            <select
              value={selectedApplication.status || "new"}
              onChange={(event) => handleStatusChange(event.target.value)}
              disabled={isSaving}
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Assigned Inbox / Artist
            <select
              value={selectedApplication.assignedInbox || "general"}
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

        {actionSuccess && <p className="success-message">{actionSuccess}</p>}
        {actionError && <p className="error-message">{actionError}</p>}

        <div className="detail-grid">
          <article className="detail-card">
            <h3>Client Info</h3>

            <p>
              <strong>Name:</strong>{" "}
              {selectedApplication.clientName || "Not provided"}
            </p>

            <p>
              <strong>Email:</strong>{" "}
              {selectedApplication.clientEmail || "Not provided"}
            </p>

            <p>
              <strong>Phone:</strong>{" "}
              {selectedApplication.phone || "Not provided"}
            </p>

            <p>
              <strong>Instagram:</strong>{" "}
              {selectedApplication.instagram || "Not provided"}
            </p>

            <p>
              <strong>Contact:</strong>{" "}
              {formatValue(selectedApplication.preferredContactMethod)}
            </p>
          </article>

          <article className="detail-card">
            <h3>Artist / Tier</h3>

            <p>
              <strong>Preferred Artist:</strong>{" "}
              {artistLabels[selectedApplication.preferredArtist] ||
                formatValue(selectedApplication.preferredArtist)}
            </p>

            <p>
              <strong>Assigned Inbox:</strong>{" "}
              {formatValue(selectedApplication.assignedInbox || "general")}
            </p>

            <p>
              <strong>Assigned Artist ID:</strong>{" "}
              {selectedApplication.assignedArtistId || "Not assigned"}
            </p>

            <p>
              <strong>Tier Interest:</strong>{" "}
              {tierLabels[selectedApplication.budget?.tierInterest] ||
                formatValue(selectedApplication.budget?.tierInterest)}
            </p>

            <p>
              <strong>Monthly Comfort:</strong>{" "}
              {formatValue(selectedApplication.budget?.monthlyComfort)}
            </p>

            <p>
              <strong>Payment Style:</strong>{" "}
              {formatValue(selectedApplication.budget?.paymentStyle)}
            </p>
          </article>

          <article className="detail-card detail-card-wide">
            <h3>Tattoo Project Idea</h3>

            <p>
              <strong>Project Type:</strong>{" "}
              {formatValue(selectedApplication.project?.projectType)}
            </p>

            <p>
              <strong>Placement:</strong>{" "}
              {selectedApplication.project?.placement || "Not provided"}
            </p>

            <p>
              <strong>Body Side:</strong>{" "}
              {formatValue(selectedApplication.project?.bodySide)}
            </p>

            <p>
              <strong>Size:</strong>{" "}
              {formatValue(selectedApplication.project?.sizeCategory)}
            </p>

            <p>
              <strong>Detail Level:</strong>{" "}
              {formatValue(selectedApplication.project?.detailLevel)}
            </p>

            <p>
              <strong>Colour:</strong>{" "}
              {formatValue(selectedApplication.project?.colourPreference)}
            </p>

            <p className="pre-wrap">
              <strong>Idea:</strong>{" "}
              {selectedApplication.project?.tattooIdea || "Not provided"}
            </p>
          </article>

          <article className="detail-card">
            <h3>Cover-Up Info</h3>

            <p>
              <strong>Cover-Up:</strong>{" "}
              {formatValue(selectedApplication.coverUp?.isCoverUp)}
            </p>

            <p className="pre-wrap">
              <strong>Description:</strong>{" "}
              {selectedApplication.coverUp?.coverUpDescription ||
                "Not provided"}
            </p>
          </article>

          <article className="detail-card">
            <h3>Timeline</h3>

            <p>
              <strong>Planning Timeline:</strong>{" "}
              {formatValue(selectedApplication.timeline?.planningTimeline)}
            </p>

            <p>
              <strong>Completion Window:</strong>{" "}
              {formatValue(selectedApplication.timeline?.completionWindow)}
            </p>

            <p className="pre-wrap">
              <strong>Availability:</strong>{" "}
              {selectedApplication.timeline?.availability || "Not provided"}
            </p>
          </article>

          <article className="detail-card">
            <h3>Health / Readiness</h3>

            <p>
              <strong>Ready for Consult:</strong>{" "}
              {formatValue(selectedApplication.readiness?.readyForConsult)}
            </p>

            <p>
              <strong>Health Considerations:</strong>{" "}
              {formatValue(
                selectedApplication.readiness?.healthConsiderations
              )}
            </p>

            <p className="pre-wrap">
              <strong>Details:</strong>{" "}
              {selectedApplication.readiness?.healthDetails || "Not provided"}
            </p>
          </article>

          <article className="detail-card detail-card-wide">
            <h3>Acknowledgements</h3>

            <div className="ack-grid">
              <p>
                Application Only:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.applicationOnly
                )}
              </p>

              <p>
                No Payment Collected:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.noPaymentCollected
                )}
              </p>

              <p>
                No Guarantee:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.noGuarantee
                )}
              </p>

              <p>
                Not Investment/Loan/Discount:{" "}
                {formatValue(
                  selectedApplication.acknowledgements
                    ?.notInvestmentLoanDiscount
                )}
              </p>

              <p>
                Mandatory Costs:{" "}
                {formatValue(
                  selectedApplication.acknowledgements
                    ?.mandatoryCostsBeforeEnrollment
                )}
              </p>

              <p>
                Terms Before Enrollment:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.termsBeforeEnrollment
                )}
              </p>

              <p>
                Studio Policy:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.studioPolicy
                )}
              </p>

              <p>
                Accurate Info:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.informationAccurate
                )}
              </p>

              <p>
                Contact Permission:{" "}
                {formatValue(
                  selectedApplication.acknowledgements?.contactPermission
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
                placeholder="Example: Good fit for Ben, likely full sleeve, needs consult."
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
              {selectedApplication.adminReview?.lastReviewedBy ||
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