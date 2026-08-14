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

const statusOptionsByKind = {
  message: [
    { value: "open", label: "Open" },
    { value: "reviewing", label: "Reviewing" },
    { value: "waiting_on_client", label: "Waiting on Client" },
    { value: "waiting_on_studio", label: "Waiting on Studio" },
    { value: "closed", label: "Closed" },
  ],
  consult: [
    { value: "new", label: "New" },
    { value: "reviewing", label: "Reviewing" },
    { value: "consult_needed", label: "Consult Needed" },
    { value: "approved", label: "Approved" },
    { value: "project_created", label: "Project Created" },
    { value: "declined", label: "Declined" },
    { value: "closed", label: "Closed" },
  ],
  application: [
    { value: "new", label: "New" },
    { value: "reviewing", label: "Reviewing" },
    { value: "offer_needed", label: "Offer Needed" },
    { value: "membership_offer_sent", label: "Membership Offer Sent" },
    { value: "project_created", label: "Project Created" },
    { value: "declined", label: "Declined" },
    { value: "closed", label: "Closed" },
  ],
  offer_response: [
    { value: "new", label: "New" },
    { value: "reviewing", label: "Reviewing" },
    { value: "accepted_pending_admin", label: "Accepted - Pending Admin" },
    { value: "approved", label: "Approved" },
    { value: "question_answered", label: "Question Answered" },
    { value: "declined", label: "Declined" },
    { value: "closed", label: "Closed" },
  ],
  membership_request: [
    { value: "new", label: "New" },
    { value: "reviewing", label: "Reviewing" },
    { value: "approved_pause", label: "Approved - Pause" },
    { value: "approved_cancel", label: "Approved - Cancel" },
    { value: "denied", label: "Denied" },
    { value: "closed", label: "Closed" },
  ],
};

const inboxOptions = [
  { value: "general", label: "General / Undecided" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
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

function getItemTime(item) {
  return (
    timestampToMillis(item.lastMessageAt) ||
    timestampToMillis(item.submittedAt) ||
    timestampToMillis(item.createdAt) ||
    timestampToMillis(item.updatedAt)
  );
}

function getCollectionName(kind) {
  if (kind === "message") return "conversations";
  if (kind === "consult") return "consultRequests";
  if (kind === "application") return "membershipApplications";
  if (kind === "offer_response") return "membershipOfferResponses";
  if (kind === "membership_request") return "membershipChangeRequests";

  return "";
}

function getStatusField(kind) {
  if (kind === "offer_response") return "responseStatus";
  if (kind === "membership_request") return "requestStatus";

  return "status";
}

function getItemStatus(item) {
  if (item.kind === "offer_response") return item.responseStatus || "new";
  if (item.kind === "membership_request") return item.requestStatus || "new";

  return item.status || "new";
}

function getKindLabel(kind) {
  if (kind === "message") return "Unread Message";
  if (kind === "consult") return "Consult Request";
  if (kind === "application") return "Membership Application";
  if (kind === "offer_response") return "Offer Response";
  if (kind === "membership_request") return "Membership Request";

  return "Intake Item";
}

function getItemTitle(item) {
  if (item.kind === "message") return item.subject || "Tattoo Portal Message";
  if (item.kind === "consult") return `Consult - ${item.clientName || item.fullName || "Client"}`;
  if (item.kind === "application") return "Tattoo Project Membership Application";
  if (item.kind === "offer_response") return item.responseLabel || "Membership Offer Response";
  if (item.kind === "membership_request") return formatValue(item.requestType);

  return "Intake Item";
}

function getItemPreview(item) {
  if (item.kind === "message") return item.lastMessagePreview || "No message preview.";
  if (item.kind === "consult") return item.tattooIdea || item.projectIdea || "No consult note.";
  if (item.kind === "application") return item.project?.tattooIdea || item.tattooIdea || "No project idea.";
  if (item.kind === "offer_response") return item.clientNote || item.note || "No client note.";
  if (item.kind === "membership_request") return item.reason || item.notes || "No reason provided.";

  return "";
}

function getClientName(item) {
  return item.clientName || item.fullName || item.name || "Client";
}

function getClientEmail(item) {
  return item.clientEmail || item.email || "";
}

function getClientUid(item) {
  return item.clientUid || "";
}

function findRelatedConversation(item, conversations) {
  if (item.kind === "message") return item;

  return (
    conversations.find((conversation) => {
      if (item.conversationId && conversation.id === item.conversationId) {
        return true;
      }

      if (item.kind === "consult" && conversation.consultRequestId === item.id) {
        return true;
      }

      if (
        item.kind === "application" &&
        conversation.applicationId === item.id
      ) {
        return true;
      }

      if (
        item.kind === "offer_response" &&
        conversation.membershipOfferResponseId === item.id
      ) {
        return true;
      }

      if (
        item.kind === "membership_request" &&
        conversation.membershipChangeRequestId === item.id
      ) {
        return true;
      }

      if (
        item.sourceId &&
        conversation.sourceId &&
        conversation.sourceId === item.sourceId
      ) {
        return true;
      }

      return false;
    }) || null
  );
}

function getItemAdminLink(item) {
  if (item.kind === "message") return "/admin/inbox";
  if (item.kind === "consult") return "/admin/consults";
  if (item.kind === "application") return "/admin/applications";
  if (item.kind === "offer_response") return "/admin/membership-offer-responses";
  if (item.kind === "membership_request") return "/admin/membership-requests";

  return "/admin/dashboard";
}

export default function AdminIntakeDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [conversations, setConversations] = useState([]);
  const [consults, setConsults] = useState([]);
  const [applications, setApplications] = useState([]);
  const [offerResponses, setOfferResponses] = useState([]);
  const [membershipChangeRequests, setMembershipChangeRequests] = useState([]);

  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [statusDraft, setStatusDraft] = useState("new");
  const [assignedInboxDraft, setAssignedInboxDraft] = useState("general");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [portalMessageDraft, setPortalMessageDraft] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const intakeItems = useMemo(() => {
    const unreadMessages = conversations
      .filter((conversation) => conversation.unreadForAdmin)
      .map((conversation) => ({
        ...conversation,
        kind: "message",
        intakeKey: `message-${conversation.id}`,
      }));

    const newConsults = consults
      .filter((consult) =>
        ["new", "reviewing", "consult_needed", undefined, null, ""].includes(
          consult.status
        )
      )
      .map((consult) => ({
        ...consult,
        kind: "consult",
        intakeKey: `consult-${consult.id}`,
      }));

    const newApplications = applications
      .filter((application) =>
        [
          "new",
          "reviewing",
          "review_needed",
          "offer_needed",
          undefined,
          null,
          "",
        ].includes(application.status)
      )
      .map((application) => ({
        ...application,
        kind: "application",
        intakeKey: `application-${application.id}`,
      }));

    const newOfferResponses = offerResponses
      .filter((response) =>
        ["new", "reviewing", undefined, null, ""].includes(
          response.responseStatus
        )
      )
      .map((response) => ({
        ...response,
        kind: "offer_response",
        intakeKey: `offer_response-${response.id}`,
      }));

    const newMembershipRequests = membershipChangeRequests
      .filter((request) =>
        ["new", "reviewing", undefined, null, ""].includes(
          request.requestStatus
        )
      )
      .map((request) => ({
        ...request,
        kind: "membership_request",
        intakeKey: `membership_request-${request.id}`,
      }));

    return [
      ...unreadMessages,
      ...newConsults,
      ...newApplications,
      ...newOfferResponses,
      ...newMembershipRequests,
    ].sort((a, b) => getItemTime(b) - getItemTime(a));
  }, [
    conversations,
    consults,
    applications,
    offerResponses,
    membershipChangeRequests,
  ]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return intakeItems.filter((item) => {
      if (typeFilter !== "all" && item.kind !== typeFilter) return false;

      if (!normalizedSearch) return true;

      const searchableText = [
        getKindLabel(item.kind),
        getItemTitle(item),
        getItemPreview(item),
        getClientName(item),
        getClientEmail(item),
        getItemStatus(item),
        item.assignedInbox,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [intakeItems, typeFilter, searchText]);

  const selectedItem = useMemo(() => {
    return (
      intakeItems.find((item) => item.intakeKey === selectedItemKey) || null
    );
  }, [intakeItems, selectedItemKey]);

  const relatedConversation = useMemo(() => {
    if (!selectedItem) return null;

    return findRelatedConversation(selectedItem, conversations);
  }, [selectedItem, conversations]);

  const summary = useMemo(() => {
    return intakeItems.reduce(
      (totals, item) => {
        totals.total += 1;

        if (item.kind === "message") totals.messages += 1;
        if (item.kind === "consult") totals.consults += 1;
        if (item.kind === "application") totals.applications += 1;
        if (item.kind === "offer_response") totals.offerResponses += 1;
        if (item.kind === "membership_request") totals.membershipRequests += 1;

        return totals;
      },
      {
        total: 0,
        messages: 0,
        consults: 0,
        applications: 0,
        offerResponses: 0,
        membershipRequests: 0,
      }
    );
  }, [intakeItems]);

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
      "conversations",
      setConversations,
      "Could not load messages."
    );

    subscribeToCollection(
      "consultRequests",
      setConsults,
      "Could not load consults."
    );

    subscribeToCollection(
      "membershipApplications",
      setApplications,
      "Could not load membership applications."
    );

    subscribeToCollection(
      "membershipOfferResponses",
      setOfferResponses,
      "Could not load offer responses."
    );

    subscribeToCollection(
      "membershipChangeRequests",
      setMembershipChangeRequests,
      "Could not load membership requests."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handleSelectItem(item) {
    setSelectedItemKey(item.intakeKey);
    setStatusDraft(getItemStatus(item));
    setAssignedInboxDraft(item.assignedInbox || "general");
    setAdminNotesDraft(
      item.adminReview?.internalNotes ||
        item.adminReview?.reviewNotes ||
        item.adminNotes ||
        ""
    );
    setPortalMessageDraft("");
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

  async function saveReview() {
    if (!selectedItem) return;

    const collectionName = getCollectionName(selectedItem.kind);
    const statusField = getStatusField(selectedItem.kind);

    if (!collectionName) {
      setActionError("Could not identify this intake item.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const itemRef = doc(db, collectionName, selectedItem.id);

      const updatePayload = {
        [statusField]: statusDraft,
        assignedInbox: assignedInboxDraft,
        assignedArtistId:
          assignedInboxDraft === "general" ? null : assignedInboxDraft,

        "adminReview.internalNotes": adminNotesDraft,
        "adminReview.reviewedBy": user.email || "",
        "adminReview.reviewedAt": serverTimestamp(),

        updatedAt: serverTimestamp(),
      };

      if (selectedItem.kind === "message") {
        updatePayload.unreadForAdmin = false;
      }

      await updateDoc(itemRef, updatePayload);

      if (relatedConversation && relatedConversation.id !== selectedItem.id) {
        await updateDoc(doc(db, "conversations", relatedConversation.id), {
          assignedInbox: assignedInboxDraft,
          assignedArtistId:
            assignedInboxDraft === "general" ? null : assignedInboxDraft,
          updatedAt: serverTimestamp(),
        });
      }

      setActionSuccess("Intake review saved.");
    } catch (error) {
      console.error(error);
      setActionError("Could not save intake review.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendPortalMessage(event) {
    event.preventDefault();

    if (!selectedItem) return;

    if (!portalMessageDraft.trim()) {
      setActionError("Write a Tattoo Portal message before sending.");
      return;
    }

    const clientUid = getClientUid(selectedItem);
    const clientEmail = getClientEmail(selectedItem);
    const clientName = getClientName(selectedItem);

    if (!clientUid) {
      setActionError(
        "This record does not have a client UID yet, so a Tattoo Portal message cannot be attached safely."
      );
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      let conversationId = relatedConversation?.id || "";

      if (!conversationId) {
        const conversationRef = await addDoc(collection(db, "conversations"), {
          clientUid,
          clientEmail,
          clientName,

          subject: `${getKindLabel(selectedItem.kind)} - ${clientName}`,
          sourceType: selectedItem.kind,
          sourceId: selectedItem.id,

          applicationId:
            selectedItem.kind === "application" ? selectedItem.id : null,
          consultRequestId:
            selectedItem.kind === "consult" ? selectedItem.id : null,
          membershipOfferResponseId:
            selectedItem.kind === "offer_response" ? selectedItem.id : null,
          membershipChangeRequestId:
            selectedItem.kind === "membership_request" ? selectedItem.id : null,

          assignedInbox: assignedInboxDraft,
          assignedArtistId:
            assignedInboxDraft === "general" ? null : assignedInboxDraft,

          status: "waiting_on_client",
          lastMessagePreview: portalMessageDraft.trim().slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: false,
          unreadForClient: true,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        conversationId = conversationRef.id;
      }

      await addDoc(collection(db, "messages"), {
        conversationId,
        applicationId:
          selectedItem.kind === "application" ? selectedItem.id : null,
        consultRequestId:
          selectedItem.kind === "consult" ? selectedItem.id : null,
        membershipOfferResponseId:
          selectedItem.kind === "offer_response" ? selectedItem.id : null,
        membershipChangeRequestId:
          selectedItem.kind === "membership_request" ? selectedItem.id : null,
        sourceType: selectedItem.kind,
        sourceId: selectedItem.id,

        clientUid,
        clientEmail,

        senderUid: user.uid,
        senderRole: "admin",
        senderName: user.displayName || "Fawcett Tattoo & Art Studio",

        body: portalMessageDraft.trim(),

        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "conversations", conversationId), {
        assignedInbox: assignedInboxDraft,
        assignedArtistId:
          assignedInboxDraft === "general" ? null : assignedInboxDraft,
        status: "waiting_on_client",
        lastMessagePreview: portalMessageDraft.trim().slice(0, 180),
        lastMessageAt: serverTimestamp(),
        unreadForAdmin: false,
        unreadForClient: true,
        updatedAt: serverTimestamp(),
      });

      setPortalMessageDraft("");
      setActionSuccess("Tattoo Portal message sent.");
    } catch (error) {
      console.error(error);
      setActionError("Could not send Tattoo Portal message.");
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
          <h1>Intake</h1>

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
          <h1>Intake</h1>

          <p>
            Review new Tattoo Portal messages, consult requests, membership
            applications, offer responses, and payment change requests.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
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

      <section className="admin-intake-summary-grid">
        <article className="portal-stat-card">
          <p>Total Intake</p>
          <strong>{summary.total}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Messages</p>
          <strong>{summary.messages}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Consults</p>
          <strong>{summary.consults}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Membership</p>
          <strong>
            {summary.applications +
              summary.offerResponses +
              summary.membershipRequests}
          </strong>
        </article>
      </section>

      <section className="admin-intake-layout">
        <aside className="applications-list-panel admin-intake-sidebar">
          <div className="panel-heading">
            <h2>Needs Review</h2>
            <p>{filteredItems.length}</p>
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
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All intake</option>
                <option value="message">Unread messages</option>
                <option value="consult">Consult requests</option>
                <option value="application">Membership applications</option>
                <option value="offer_response">Offer responses</option>
                <option value="membership_request">Payment requests</option>
              </select>
            </label>
          </div>

          {filteredItems.length === 0 ? (
            <p>No intake items need review.</p>
          ) : (
            <div className="application-list">
              {filteredItems.map((item) => (
                <button
                  key={item.intakeKey}
                  type="button"
                  className={
                    selectedItemKey === item.intakeKey
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectItem(item)}
                >
                  <div>
                    <strong>{getItemTitle(item)}</strong>
                    <span>{getClientName(item)}</span>
                  </div>

                  <p>{getItemPreview(item)}</p>

                  <div className="application-card-meta">
                    <small>{getKindLabel(item.kind)}</small>
                    <small>{formatValue(getItemStatus(item))}</small>
                  </div>

                  <small>{formatDate(getItemTime(item))}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel admin-intake-main-panel">
          {!selectedItem ? (
            <div className="empty-state">
              <h2>Select an intake item</h2>
              <p>
                Choose a new message, consult, membership application, offer
                response, or payment request to review.
              </p>
            </div>
          ) : (
            <article className="admin-card admin-intake-detail-card">
              <div className="admin-intake-title-row">
                <div>
                  <p className="eyebrow">{getKindLabel(selectedItem.kind)}</p>
                  <h2>{getItemTitle(selectedItem)}</h2>
                  <p>
                    {getClientName(selectedItem)} ·{" "}
                    {getClientEmail(selectedItem) || "No email"}
                  </p>
                </div>

                <span className="project-detail-pill">
                  {formatValue(getItemStatus(selectedItem))}
                </span>
              </div>

              {actionSuccess && <p className="success-message">{actionSuccess}</p>}
              {actionError && <p className="error-message">{actionError}</p>}

              <section className="admin-intake-top-grid">
                <article className="detail-card">
                  <h3>Client</h3>
                  <p>
                    <strong>Name:</strong> {getClientName(selectedItem)}
                  </p>
                  <p>
                    <strong>Email:</strong>{" "}
                    {getClientEmail(selectedItem) || "Not provided"}
                  </p>
                  <p>
                    <strong>Client UID:</strong>{" "}
                    {getClientUid(selectedItem) || "No Tattoo Portal UID"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Source</h3>
                  <p>
                    <strong>Type:</strong> {getKindLabel(selectedItem.kind)}
                  </p>
                  <p>
                    <strong>Submitted:</strong>{" "}
                    {formatDate(getItemTime(selectedItem))}
                  </p>
                  <p>
                    <strong>Related Conversation:</strong>{" "}
                    {relatedConversation ? "Yes" : "Not yet"}
                  </p>
                </article>
              </section>

              <section className="admin-intake-section">
                <div className="panel-heading">
                  <h2>Client Note / Preview</h2>
                  <p>Review</p>
                </div>

                <div className="admin-note-box">
                  {getItemPreview(selectedItem)}
                </div>
              </section>

              <section className="admin-intake-section">
                <div className="panel-heading">
                  <h2>Review Item</h2>
                  <p>Status</p>
                </div>

                <div className="admin-intake-form">
                  <label>
                    Status
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                    >
                      {(statusOptionsByKind[selectedItem.kind] || []).map(
                        (status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    Assign Inbox / Artist
                    <select
                      value={assignedInboxDraft}
                      onChange={(event) =>
                        setAssignedInboxDraft(event.target.value)
                      }
                    >
                      {inboxOptions.map((inbox) => (
                        <option key={inbox.value} value={inbox.value}>
                          {inbox.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-intake-wide">
                    Private Admin Notes
                    <textarea
                      value={adminNotesDraft}
                      onChange={(event) => setAdminNotesDraft(event.target.value)}
                      rows={5}
                      placeholder="Private studio review notes."
                    />
                  </label>

                  <button
                    className="button button-primary admin-intake-wide"
                    type="button"
                    onClick={saveReview}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Review"}
                  </button>
                </div>
              </section>

              <section className="admin-intake-section">
                <div className="panel-heading">
                  <h2>Send Tattoo Portal Message</h2>
                  <p>{relatedConversation ? "Existing thread" : "New thread"}</p>
                </div>

                <form className="admin-intake-form" onSubmit={sendPortalMessage}>
                  <label className="admin-intake-wide">
                    Message
                    <textarea
                      value={portalMessageDraft}
                      onChange={(event) =>
                        setPortalMessageDraft(event.target.value)
                      }
                      rows={5}
                      placeholder="Write a message to the client..."
                    />
                  </label>

                  <button
                    className="button button-primary admin-intake-wide"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Sending..." : "Send Portal Message"}
                  </button>
                </form>
              </section>

              <section className="admin-intake-section">
                <div className="panel-heading">
                  <h2>Open Full Admin Page</h2>
                  <p>Shortcut</p>
                </div>

                <Link
                  className="button button-secondary"
                  href={getItemAdminLink(selectedItem)}
                >
                  Open Related Admin Page
                </Link>
              </section>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}