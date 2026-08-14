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

const requestTypeOptions = [
  { value: "pause_monthly_payments", label: "Suspend / Pause Monthly Payments" },
  { value: "cancel_monthly_payments", label: "Cancel Monthly Membership Payments" },
  { value: "resume_monthly_payments", label: "Resume Monthly Payments" },
  { value: "change_monthly_amount", label: "Request Monthly Amount Change" },
];

const requestStatusOptions = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "approved_pause", label: "Approved - Pause" },
  { value: "approved_cancel", label: "Approved - Cancel Monthly Payments" },
  { value: "approved_resume", label: "Approved - Resume" },
  { value: "change_requested", label: "More Info Needed" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
];

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

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || formatValue(value);
}

function getRequestStatusClass(status) {
  if (
    status === "approved_pause" ||
    status === "approved_cancel" ||
    status === "approved_resume" ||
    status === "completed"
  ) {
    return "request-status-pill request-status-good";
  }

  if (status === "declined") {
    return "request-status-pill request-status-bad";
  }

  if (status === "reviewing" || status === "change_requested") {
    return "request-status-pill request-status-watch";
  }

  return "request-status-pill";
}

export default function AdminMembershipRequests() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [statusDraft, setStatusDraft] = useState("new");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [clientMessageDraft, setClientMessageDraft] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return requests
      .filter((request) => {
        if (statusFilter !== "all" && request.requestStatus !== statusFilter) {
          return false;
        }

        if (typeFilter !== "all" && request.requestType !== typeFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          request.clientName,
          request.clientEmail,
          request.requestType,
          request.requestStatus,
          request.reason,
          request.adminReview?.internalNotes,
          request.adminReview?.clientMessage,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
  }, [requests, searchText, statusFilter, typeFilter]);

  const selectedRequest = useMemo(() => {
    return requests.find((request) => request.id === selectedRequestId) || null;
  }, [requests, selectedRequestId]);

  const totals = useMemo(() => {
    return requests.reduce(
      (summary, request) => {
        summary.total += 1;

        if (request.requestStatus === "new") {
          summary.new += 1;
        }

        if (request.requestStatus === "reviewing") {
          summary.reviewing += 1;
        }

        if (
          request.requestStatus === "approved_pause" ||
          request.requestStatus === "approved_cancel" ||
          request.requestStatus === "approved_resume"
        ) {
          summary.approved += 1;
        }

        if (request.requestStatus === "declined") {
          summary.declined += 1;
        }

        return summary;
      },
      {
        total: 0,
        new: 0,
        reviewing: 0,
        approved: 0,
        declined: 0,
      }
    );
  }, [requests]);

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

    const requestsQuery = query(collection(db, "membershipChangeRequests"));

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const nextRequests = snapshot.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        }));

        setRequests(nextRequests);
        setActionError("");
      },
      (error) => {
        console.error(error);
        setActionError("Could not load membership requests. Check Firestore rules.");
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  function handleSelectRequest(request) {
    setSelectedRequestId(request.id);
    setStatusDraft(request.requestStatus || "new");
    setAdminNotesDraft(request.adminReview?.internalNotes || "");
    setClientMessageDraft(request.adminReview?.clientMessage || "");
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

  async function saveRequestReview() {
    if (!selectedRequest) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const requestRef = doc(
        db,
        "membershipChangeRequests",
        selectedRequest.id
      );

      await updateDoc(requestRef, {
        requestStatus: statusDraft,
        "adminReview.internalNotes": adminNotesDraft,
        "adminReview.clientMessage": clientMessageDraft,
        "adminReview.reviewedBy": user.email,
        "adminReview.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Membership request updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update membership request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAndSendClientMessage() {
    if (!selectedRequest) return;

    if (!clientMessageDraft.trim()) {
      setActionError("Add a client message before sending.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      let conversationId = selectedRequest.conversationId || null;

      if (!conversationId) {
        const conversationRef = await addDoc(collection(db, "conversations"), {
          clientUid: selectedRequest.clientUid,
          clientEmail: selectedRequest.clientEmail || "",
          clientName: selectedRequest.clientName || "Client",

          applicationId: null,
          consultRequestId: null,
          membershipChangeRequestId: selectedRequest.id,
          sourceType: "membershipChangeRequest",
          sourceId: selectedRequest.id,

          assignedInbox: "general",
          assignedArtistId: null,

          subject: `Membership Payment Request - ${getOptionLabel(
            requestTypeOptions,
            selectedRequest.requestType
          )}`,

          status: "open",
          lastMessagePreview: clientMessageDraft.trim().slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: false,
          unreadForClient: true,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        conversationId = conversationRef.id;
      } else {
        const conversationRef = doc(db, "conversations", conversationId);

        await updateDoc(conversationRef, {
          lastMessagePreview: clientMessageDraft.trim().slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: false,
          unreadForClient: true,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "messages"), {
        conversationId,
        applicationId: null,
        consultRequestId: null,
        membershipChangeRequestId: selectedRequest.id,
        sourceType: "membershipChangeRequest",
        sourceId: selectedRequest.id,

        clientUid: selectedRequest.clientUid,
        clientEmail: selectedRequest.clientEmail || "",

        senderUid: user.uid,
        senderRole: "admin",
        senderName: user.displayName || "Fawcett Tattoos & Art Studio",

        body: clientMessageDraft.trim(),

        createdAt: serverTimestamp(),
      });

      const requestRef = doc(
        db,
        "membershipChangeRequests",
        selectedRequest.id
      );

      await updateDoc(requestRef, {
        requestStatus: statusDraft,
        conversationId,
        "adminReview.internalNotes": adminNotesDraft,
        "adminReview.clientMessage": clientMessageDraft.trim(),
        "adminReview.messageSentBy": user.email,
        "adminReview.messageSentAt": serverTimestamp(),
        "adminReview.reviewedBy": user.email,
        "adminReview.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Request updated and client message sent.");
    } catch (error) {
      console.error(error);
      setActionError(
        "Could not send the client message. Check conversation and message Firestore rules."
      );
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
          <h1>Membership Requests</h1>

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
          <h1>Membership Requests</h1>

          <p>
            Review client requests to pause, cancel, resume, or change monthly
            membership payments.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/clients">
            Clients
          </Link>

          <Link className="button button-secondary" href="/admin/payments">
            Payments
          </Link>

          <Link className="button button-secondary" href="/admin/credit-ledger">
            Credit Ledger
          </Link>

          <Link className="button button-secondary" href="/admin/schedule">
            Schedule
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
          </Link>

          <Link className="button button-secondary" href="/admin/membership-offers">
            Membership Offers
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

      <section className="membership-request-summary-grid">
        <article className="portal-stat-card">
          <p>Total Requests</p>
          <strong>{totals.total}</strong>
        </article>

        <article className="portal-stat-card">
          <p>New</p>
          <strong>{totals.new}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Reviewing</p>
          <strong>{totals.reviewing}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Approved</p>
          <strong>{totals.approved}</strong>
        </article>
      </section>

      <section className="admin-applications-layout">
        <aside className="applications-list-panel">
          <div className="panel-heading">
            <h2>Requests</h2>
            <p>{filteredRequests.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, reason..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {requestStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All request types</option>
                {requestTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredRequests.length === 0 ? (
            <p>No membership requests yet.</p>
          ) : (
            <div className="application-list">
              {filteredRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={
                    selectedRequestId === request.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectRequest(request)}
                >
                  <div>
                    <strong>{request.clientName || "Client"}</strong>
                    <span>{request.clientEmail}</span>
                  </div>

                  <p>{getOptionLabel(requestTypeOptions, request.requestType)}</p>

                  <div className="application-card-meta">
                    <small>
                      {getOptionLabel(
                        requestStatusOptions,
                        request.requestStatus
                      )}
                    </small>

                    <small>
                      Balance{" "}
                      {formatMoneyFromCents(
                        request.currentCreditBalanceCents
                      )}
                    </small>
                  </div>

                  <small>{formatDate(request.createdAt)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          {!selectedRequest ? (
            <div className="empty-state">
              <h2>Select a request</h2>
              <p>
                Choose a membership payment request to review the client note,
                current credit balance, and admin response.
              </p>
            </div>
          ) : (
            <article className="admin-card membership-admin-card">
              <div className="membership-admin-title-row">
                <div>
                  <p className="eyebrow">Request Details</p>
                  <h2>{selectedRequest.clientName || "Client"}</h2>
                </div>

                <span className={getRequestStatusClass(selectedRequest.requestStatus)}>
                  {getOptionLabel(
                    requestStatusOptions,
                    selectedRequest.requestStatus
                  )}
                </span>
              </div>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client</h3>

                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedRequest.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedRequest.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Submitted:</strong>{" "}
                    {formatDate(selectedRequest.createdAt)}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Credit Snapshot</h3>

                  <p>
                    <strong>Current Balance:</strong>{" "}
                    {formatMoneyFromCents(
                      selectedRequest.currentCreditBalanceCents
                    )}
                  </p>

                  <p>
                    <strong>Total Added:</strong>{" "}
                    {formatMoneyFromCents(selectedRequest.totalCreditAddedCents)}
                  </p>

                  <p>
                    <strong>Total Used:</strong>{" "}
                    {formatMoneyFromCents(selectedRequest.totalCreditUsedCents)}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Request</h3>

                  <p>
                    <strong>Type:</strong>{" "}
                    {getOptionLabel(
                      requestTypeOptions,
                      selectedRequest.requestType
                    )}
                  </p>

                  <p>
                    <strong>Client Reason:</strong>
                  </p>

                  <div className="admin-note-box">
                    {selectedRequest.reason || "No reason provided."}
                  </div>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Admin Review</h3>

                  <label>
                    Status
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                      disabled={isSaving}
                    >
                      {requestStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Internal Admin Notes
                    <textarea
                      value={adminNotesDraft}
                      onChange={(event) =>
                        setAdminNotesDraft(event.target.value)
                      }
                      rows={5}
                      placeholder="Private notes. Example: pause approved for August only, client keeps available credit balance."
                    />
                  </label>

                  <label>
                    Tattoo Portal Message
                    <textarea
                      value={clientMessageDraft}
                      onChange={(event) =>
                        setClientMessageDraft(event.target.value)
                      }
                      rows={5}
                      placeholder="Message to the client. Example: We reviewed your request and approved a one-month payment pause. Your available In-Studio Credit remains on your account."
                    />
                  </label>

                  <div className="membership-admin-button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={saveRequestReview}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Review"}
                    </button>

                    <button
                      className="button button-primary"
                      type="button"
                      onClick={saveAndSendClientMessage}
                      disabled={isSaving}
                    >
                      {isSaving ? "Sending..." : "Save + Send Portal Message"}
                    </button>
                  </div>
                </article>
              </div>

              <div className="membership-admin-notice">
                <strong>Reminder:</strong> Treat this as a request workflow, not
                an automatic cancellation. Review unused credit, upcoming
                appointments, and written studio terms before approving changes.
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}