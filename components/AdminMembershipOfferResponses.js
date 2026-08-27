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

const responseStatusOptions = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "approved_to_move_forward", label: "Approved to Move Forward" },
  { value: "client_question_answered", label: "Client Question Answered" },
  { value: "declined_by_client", label: "Declined by Client" },
  { value: "declined_by_studio", label: "Declined by Studio" },
  { value: "membership_active", label: "Membership Active" },
  { value: "completed", label: "Completed" },
];

const applicationStatusOptions = [
  { value: "membership_offer_sent", label: "Offer Sent" },
  { value: "client_reviewing_offer", label: "Client Reviewing Offer" },
  { value: "membership_approved", label: "Membership Approved" },
  { value: "membership_active", label: "Membership Active" },
  { value: "membership_paused", label: "Membership Paused" },
  { value: "membership_cancelled", label: "Membership Cancelled" },
  { value: "declined", label: "Declined" },
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

function getResponseLabel(responseType) {
  if (responseType === "request_accept_offer") {
    return "Requested to Accept Offer";
  }

  if (responseType === "ask_question") {
    return "Asked a Question";
  }

  if (responseType === "decline_offer") {
    return "Declined Offer";
  }

  return formatValue(responseType);
}

function getStatusLabel(options, value) {
  return options.find((option) => option.value === value)?.label || formatValue(value);
}

function getResponseStatusClass(status) {
  if (
    status === "approved_to_move_forward" ||
    status === "client_question_answered" ||
    status === "membership_active" ||
    status === "completed"
  ) {
    return "request-status-pill request-status-good";
  }

  if (status === "declined_by_client" || status === "declined_by_studio") {
    return "request-status-pill request-status-bad";
  }

  if (status === "reviewing") {
    return "request-status-pill request-status-watch";
  }

  return "request-status-pill";
}

function getDefaultClientMessage(response, application) {
  const responseType = response?.responseType;
  const clientName = application?.clientName || "there";
  const offer = application?.membershipOffer || {};

  if (responseType === "request_accept_offer") {
    return `Hi ${clientName},

Thank you for requesting to move forward with your Tattoo Project Membership offer.

We reviewed your response. The next step is for the studio to confirm your final membership terms, payment start date, and project expectations before activating the membership.

Offer on file:
${offer.tierLabel || formatValue(offer.tier)}
Initial payment: ${formatMoneyFromCents(offer.initialPaymentCents)}
Monthly payment: ${formatMoneyFromCents(offer.monthlyPaymentCents)}
Minimum project value: ${formatMoneyFromCents(offer.minimumProjectValueCents)}

This is not a flat-rate tattoo package. Payments build In-Studio Credit toward an approved tattoo project.`;
  }

  if (responseType === "ask_question") {
    return `Hi ${clientName},

Thank you for your question about your Tattoo Project Membership offer.

Here is our response:

`;
  }

  if (responseType === "decline_offer") {
    return `Hi ${clientName},

Thank you for letting us know. We have marked your Tattoo Project Membership offer as declined for now.

You are welcome to message us again if you want to revisit a tattoo project in the future.`;
  }

  return `Hi ${clientName},

Thank you for your response. The studio has reviewed it and will confirm the next step here.`;
}

export default function AdminMembershipOfferResponses(){
  const router = useRouter();
  
  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [responses, setResponses] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedResponseId, setSelectedResponseId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [responseStatusDraft, setResponseStatusDraft] = useState("new");
  const [applicationStatusDraft, setApplicationStatusDraft] = useState("client_reviewing_offer");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [clientMessageDraft, setClientMessageDraft] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const applicationsById = useMemo(() => {
    const applicationMap = new Map();

    applications.forEach((application) => {
      applicationMap.set(application.id, application);
    });

    return applicationMap;
  }, [applications]);

  const enrichedResponses = useMemo(() => {
    return responses.map((response) => {
      const application = applicationsById.get(response.applicationId) || null;

      return {
        ...response,
        application,
      };
    });
  }, [responses, applicationsById]);

  const filteredResponses = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return enrichedResponses
      .filter((response) => {
        if (statusFilter !== "all" && response.responseStatus !== statusFilter) {
          return false;
        }

        if (typeFilter !== "all" && response.responseType !== typeFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          response.application?.clientName,
          response.application?.clientEmail,
          response.responseType,
          response.responseLabel,
          response.responseStatus,
          response.clientNote,
          response.application?.membershipOffer?.tierLabel,
          response.application?.project?.tattooIdea,
          response.adminReview?.internalNotes,
          response.adminReview?.clientMessage,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
  }, [enrichedResponses, searchText, statusFilter, typeFilter]);

  const selectedResponse = useMemo(() => {
    return enrichedResponses.find((response) => response.id === selectedResponseId) || null;
  }, [enrichedResponses, selectedResponseId]);

  const totals = useMemo(() => {
    return responses.reduce(
      (summary, response) => {
        summary.total += 1;

        if (response.responseStatus === "new") {
          summary.new += 1;
        }

        if (response.responseType === "request_accept_offer") {
          summary.acceptRequests += 1;
        }

        if (response.responseType === "ask_question") {
          summary.questions += 1;
        }

        if (response.responseType === "decline_offer") {
          summary.declines += 1;
        }

        return summary;
      },
      {
        total: 0,
        new: 0,
        acceptRequests: 0,
        questions: 0,
        declines: 0,
      }
    );
  }, [responses]);

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
      "membershipOfferResponses",
      setResponses,
      "Could not load membership offer responses. Check Firestore rules."
    );

    subscribeToCollection(
      "membershipApplications",
      setApplications,
      "Could not load membership applications. Check Firestore rules."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleSelectResponse(response) {
    const application = response.application || null;

    setSelectedResponseId(response.id);
    setResponseStatusDraft(response.responseStatus || "new");
    setApplicationStatusDraft(application?.status || "client_reviewing_offer");
    setAdminNotesDraft(response.adminReview?.internalNotes || "");
    setClientMessageDraft(
      response.adminReview?.clientMessage ||
        getDefaultClientMessage(response, application)
    );
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

  async function saveResponseReview() {
    if (!selectedResponse) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const responseRef = doc(
        db,
        "membershipOfferResponses",
        selectedResponse.id
      );

      await updateDoc(responseRef, {
        responseStatus: responseStatusDraft,
        "adminReview.internalNotes": adminNotesDraft,
        "adminReview.clientMessage": clientMessageDraft,
        "adminReview.reviewedBy": user.email,
        "adminReview.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (selectedResponse.applicationId) {
        const applicationRef = doc(
          db,
          "membershipApplications",
          selectedResponse.applicationId
        );

        await updateDoc(applicationRef, {
          status: applicationStatusDraft,
          "adminReview.offerResponseStatus": responseStatusDraft,
          "adminReview.offerResponseUpdatedBy": user.email,
          "adminReview.offerResponseUpdatedAt": serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setActionSuccess("Offer response review saved.");
    } catch (error) {
      console.error(error);
      setActionError("Could not save offer response review.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAndSendClientMessage() {
    if (!selectedResponse) return;

    if (!clientMessageDraft.trim()) {
      setActionError("Add a client message before sending.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const application = selectedResponse.application || null;
      let conversationId =
        selectedResponse.conversationId ||
        application?.conversationId ||
        null;

      if (!conversationId) {
        const conversationRef = await addDoc(collection(db, "conversations"), {
          clientUid: selectedResponse.clientUid,
          clientEmail: selectedResponse.clientEmail || "",
          clientName: selectedResponse.clientName || "Client",

          applicationId: selectedResponse.applicationId || null,
          consultRequestId: null,
          membershipChangeRequestId: null,
          membershipOfferResponseId: selectedResponse.id,
          sourceType: "membershipOfferResponse",
          sourceId: selectedResponse.id,

          assignedInbox: application?.assignedInbox || "general",
          assignedArtistId: application?.assignedArtistId || null,

          subject: `Membership Offer Response - ${getResponseLabel(
            selectedResponse.responseType
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
        applicationId: selectedResponse.applicationId || null,
        consultRequestId: null,
        membershipChangeRequestId: null,
        membershipOfferResponseId: selectedResponse.id,
        sourceType: "membershipOfferResponse",
        sourceId: selectedResponse.id,

        clientUid: selectedResponse.clientUid,
        clientEmail: selectedResponse.clientEmail || "",

        senderUid: user.uid,
        senderRole: "admin",
        senderName: user.displayName|| "Fawcett Tattoos & Art Studio",

        body: clientMessageDraft.trim(),

        createdAt: serverTimestamp(),
      });

      const responseRef = doc(
        db,
        "membershipOfferResponses",
        selectedResponse.id
      );

      await updateDoc(responseRef, {
        responseStatus: responseStatusDraft,
        conversationId,
        "adminReview.internalNotes": adminNotesDraft,
        "adminReview.clientMessage": clientMessageDraft.trim(),
        "adminReview.messageSentBy": user.email,
        "adminReview.messageSentAt": serverTimestamp(),
        "adminReview.reviewedBy": user.email,
        "adminReview.reviewedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (selectedResponse.applicationId) {
        const applicationRef = doc(
          db,
          "membershipApplications",
          selectedResponse.applicationId
        );

        await updateDoc(applicationRef, {
          status: applicationStatusDraft,
          conversationId,
          "adminReview.offerResponseStatus": responseStatusDraft,
          "adminReview.offerResponseMessageSentBy": user.email,
          "adminReview.offerResponseMessageSentAt": serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setActionSuccess("Review saved and portal message sent.");
    } catch (error) {
      console.error(error);
      setActionError(
        "Could not send portal message. Check conversation and message Firestore rules."
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
          <h1>Offer Responses</h1>

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
          <h1>Offer Responses</h1>

          <p>
            Review client responses to Tattoo Project Membership offers and
            confirm the next step.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/membership-offers">
            Membership Offers
          </Link>

          <Link className="button button-secondary" href="/admin/membership-requests">
            Membership Requests
          </Link>

          <Link className="button button-secondary" href="/admin/payments">
            Payments
          </Link>

          <Link className="button button-secondary" href="/admin/credit-ledger">
            Credit Ledger
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

      <section className="offer-response-summary-grid">
        <article className="portal-stat-card">
          <p>Total Responses</p>
          <strong>{totals.total}</strong>
        </article>

        <article className="portal-stat-card">
          <p>New</p>
          <strong>{totals.new}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Accept Requests</p>
          <strong>{totals.acceptRequests}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Questions</p>
          <strong>{totals.questions}</strong>
        </article>
      </section>

      <section className="admin-applications-layout">
        <aside className="applications-list-panel">
          <div className="panel-heading">
            <h2>Responses</h2>
            <p>{filteredResponses.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, note..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {responseStatusOptions.map((status) => (
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
                <option value="all">All response types</option>
                <option value="request_accept_offer">Request to Accept Offer</option>
                <option value="ask_question">Ask a Question</option>
                <option value="decline_offer">Decline Offer</option>
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredResponses.length === 0 ? (
            <p>No offer responses yet.</p>
          ) : (
            <div className="application-list">
              {filteredResponses.map((response) => (
                <button
                  key={response.id}
                  type="button"
                  className={
                    selectedResponseId === response.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectResponse(response)}
                >
                  <div>
                    <strong>{response.clientName || "Client"}</strong>
                    <span>{response.clientEmail}</span>
                  </div>

                  <p>{getResponseLabel(response.responseType)}</p>

                  <div className="application-card-meta">
                    <small>
                      {getStatusLabel(
                        responseStatusOptions,
                        response.responseStatus
                      )}
                    </small>

                    <small>
                      {response.application?.membershipOffer?.tierLabel || "Membership Offer"}
                    </small>
                  </div>

                  <small>{formatDate(response.createdAt)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          {!selectedResponse ? (
            <div className="empty-state">
              <h2>Select a response</h2>
              <p>
                Choose a client response to review, update the membership
                application, and send a portal reply.
              </p>
            </div>
          ) : (
            <article className="admin-card offer-response-card">
              <div className="membership-admin-title-row">
                <div>
                  <p className="eyebrow">Offer Response</p>
                  <h2>{selectedResponse.application?.clientName || "Client"}</h2>
                  <p>{getResponseLabel(selectedResponse.responseType)}</p>
                </div>

                <span
                  className={getResponseStatusClass(
                    selectedResponse.responseStatus
                  )}
                >
                  {getStatusLabel(
                    responseStatusOptions,
                    selectedResponse.responseStatus
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
                    {selectedResponse.application?.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedResponse.application?.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Submitted:</strong>{" "}
                    {formatDate(selectedResponse.createdAt)}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Offer Snapshot</h3>

                  <p>
                    <strong>Tier:</strong>{" "}
                    {selectedResponse.application?.membershipOffer?.tierLabel || "Not provided"}
                  </p>

                  <p>
                    <strong>Initial:</strong>{" "}
                    {formatMoneyFromCents(
                      selectedResponse.application?.membershipOffer?.initialPaymentCents
                    )}
                  </p>

                  <p>
                    <strong>Monthly:</strong>{" "}
                    {formatMoneyFromCents(
                      selectedResponse.application?.membershipOffer?.monthlyPaymentCents
                    )}
                  </p>

                  <p>
                    <strong>Minimum Project:</strong>{" "}
                    {formatMoneyFromCents(
                      selectedResponse.application?.membershipOffer?.minimumProjectValueCents
                    )}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Client Note</h3>

                  <div className="admin-note-box">
                    {selectedResponse.clientNote || "No note provided."}
                  </div>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Admin Review</h3>

                  <label>
                    Response Status
                    <select
                      value={responseStatusDraft}
                      onChange={(event) =>
                        setResponseStatusDraft(event.target.value)
                      }
                      disabled={isSaving}
                    >
                      {responseStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Application Status
                    <select
                      value={applicationStatusDraft}
                      onChange={(event) =>
                        setApplicationStatusDraft(event.target.value)
                      }
                      disabled={isSaving}
                    >
                      {applicationStatusOptions.map((status) => (
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
                      placeholder="Private notes. Example: client requested to accept. Confirm terms before activating."
                    />
                  </label>

                  <label>
                    Tattoo Portal Message
                    <textarea
                      value={clientMessageDraft}
                      onChange={(event) =>
                        setClientMessageDraft(event.target.value)
                      }
                      rows={7}
                      placeholder="Message to the client."
                    />
                  </label>

                  <div className="offer-response-button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={saveResponseReview}
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
                <strong>Reminder:</strong> A client response is not automatic
                enrollment. Confirm payment method, start date, final terms,
                and project approval before marking the membership active.
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
