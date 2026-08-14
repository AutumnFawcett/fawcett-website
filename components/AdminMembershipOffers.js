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

const tierOptions = [
  {
    value: "starter_member",
    label: "Starter Member",
    initialPayment: "500",
    monthlyPayment: "150",
    minimumProjectValue: "2000",
  },
  {
    value: "builder_member",
    label: "Builder Member",
    initialPayment: "750",
    monthlyPayment: "300",
    minimumProjectValue: "3500",
  },
  {
    value: "commitment_member",
    label: "Commitment Member",
    initialPayment: "1000",
    monthlyPayment: "500",
    minimumProjectValue: "6000",
  },
  {
    value: "custom",
    label: "Custom Plan",
    initialPayment: "",
    monthlyPayment: "",
    minimumProjectValue: "",
  },
];

const offerStatusOptions = [
  { value: "review_needed", label: "Review Needed" },
  { value: "membership_offer_draft", label: "Offer Draft" },
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

function dollarsToCents(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.round(numberValue * 100);
}

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function getTierLabel(value) {
  return tierOptions.find((tier) => tier.value === value)?.label || "Custom Plan";
}

function getStatusLabel(value) {
  return (
    offerStatusOptions.find((status) => status.value === value)?.label ||
    formatValue(value)
  );
}

function buildClientOfferMessage({
  clientName,
  tier,
  initialPayment,
  monthlyPayment,
  minimumProjectValue,
  paymentStartDate,
  termsSummary,
}) {
  const name = clientName || "there";

  return `Hi ${name},

We reviewed your Tattoo Project Membership application and prepared a membership offer for studio review.

Offer:
${getTierLabel(tier)}

Payment structure:
Initial payment: $${initialPayment || "0"}
Monthly payment: $${monthlyPayment || "0"}
Minimum project value: $${minimumProjectValue || "0"}
Payment start date: ${paymentStartDate || "To be confirmed"}

Important:
This is not a flat-rate tattoo package. Payments build In-Studio Credit toward an approved tattoo project. Final project cost depends on size, placement, complexity, artist, skin, cover-up needs, design changes, healing considerations, and session time.

Additional terms / notes:
${termsSummary || "Full terms will be confirmed before enrollment."}

Please reply here if you would like to review, ask questions, or move forward.`;
}

export default function AdminMembershipOffers() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  const [offerTier, setOfferTier] = useState("starter_member");
  const [offerStatus, setOfferStatus] = useState("membership_offer_draft");
  const [initialPayment, setInitialPayment] = useState("500");
  const [monthlyPayment, setMonthlyPayment] = useState("150");
  const [minimumProjectValue, setMinimumProjectValue] = useState("2000");
  const [paymentStartDate, setPaymentStartDate] = useState("");
  const [termsSummary, setTermsSummary] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [clientMessage, setClientMessage] = useState("");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return applications
      .filter((application) => {
        const currentStatus = application.status || "review_needed";
        const existingTier =
          application.membershipOffer?.tier ||
          application.budget?.tierInterest ||
          "not_selected";

        if (statusFilter !== "all" && currentStatus !== statusFilter) {
          return false;
        }

        if (tierFilter !== "all" && existingTier !== tierFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          application.clientName,
          application.clientEmail,
          application.phone,
          application.instagram,
          application.project?.tattooIdea,
          application.project?.placement,
          application.budget?.tierInterest,
          application.budget?.monthlyComfort,
          application.status,
          application.membershipOffer?.tier,
          application.membershipOffer?.termsSummary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
  }, [applications, searchText, statusFilter, tierFilter]);

  const selectedApplication = useMemo(() => {
    return (
      applications.find(
        (application) => application.id === selectedApplicationId
      ) || null
    );
  }, [applications, selectedApplicationId]);

  const totals = useMemo(() => {
    return applications.reduce(
      (summary, application) => {
        const status = application.status || "review_needed";

        summary.total += 1;

        if (status === "review_needed" || status === "new") {
          summary.reviewNeeded += 1;
        }

        if (status === "membership_offer_sent") {
          summary.offersSent += 1;
        }

        if (
          status === "membership_approved" ||
          status === "membership_active"
        ) {
          summary.approvedOrActive += 1;
        }

        return summary;
      },
      {
        total: 0,
        reviewNeeded: 0,
        offersSent: 0,
        approvedOrActive: 0,
      }
    );
  }, [applications]);

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
        setActionError("Could not load membership applications. Check Firestore rules.");
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  function applyTierDefaults(nextTier) {
    const tier = tierOptions.find((option) => option.value === nextTier);

    setOfferTier(nextTier);

    if (!tier) return;

    setInitialPayment(tier.initialPayment);
    setMonthlyPayment(tier.monthlyPayment);
    setMinimumProjectValue(tier.minimumProjectValue);
  }

  function handleSelectApplication(application) {
    const existingOffer = application.membershipOffer || {};
    const existingTier =
      existingOffer.tier || application.budget?.tierInterest || "starter_member";

    setSelectedApplicationId(application.id);
    setOfferTier(existingTier);
    setOfferStatus(application.status || "membership_offer_draft");

    const tier = tierOptions.find((option) => option.value === existingTier);

    setInitialPayment(
      existingOffer.initialPaymentDollars ||
        tier?.initialPayment ||
        "500"
    );

    setMonthlyPayment(
      existingOffer.monthlyPaymentDollars ||
        tier?.monthlyPayment ||
        "150"
    );

    setMinimumProjectValue(
      existingOffer.minimumProjectValueDollars ||
        tier?.minimumProjectValue ||
        "2000"
    );

    setPaymentStartDate(existingOffer.paymentStartDate || "");
    setTermsSummary(
      existingOffer.termsSummary ||
        "Payments build In-Studio Credit toward an approved tattoo project. Final project cost depends on size, placement, complexity, artist, skin, cover-up needs, design changes, healing considerations, and session time. All mandatory costs and full terms must be confirmed before enrollment."
    );

    setAdminNotes(application.adminReview?.membershipOfferNotes || "");

    setClientMessage(
      existingOffer.clientMessage ||
        buildClientOfferMessage({
          clientName: application.clientName,
          tier: existingTier,
          initialPayment:
            existingOffer.initialPaymentDollars ||
            tier?.initialPayment ||
            "500",
          monthlyPayment:
            existingOffer.monthlyPaymentDollars ||
            tier?.monthlyPayment ||
            "150",
          minimumProjectValue:
            existingOffer.minimumProjectValueDollars ||
            tier?.minimumProjectValue ||
            "2000",
          paymentStartDate: existingOffer.paymentStartDate || "",
          termsSummary:
            existingOffer.termsSummary ||
            "Full terms will be confirmed before enrollment.",
        })
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

  async function saveOfferDraft() {
    if (!selectedApplication) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const applicationRef = doc(
        db,
        "membershipApplications",
        selectedApplication.id
      );

      await updateDoc(applicationRef, {
        status: offerStatus,
        membershipOffer: {
          tier: offerTier,
          tierLabel: getTierLabel(offerTier),

          initialPaymentDollars: initialPayment,
          monthlyPaymentDollars: monthlyPayment,
          minimumProjectValueDollars: minimumProjectValue,

          initialPaymentCents: dollarsToCents(initialPayment),
          monthlyPaymentCents: dollarsToCents(monthlyPayment),
          minimumProjectValueCents: dollarsToCents(minimumProjectValue),

          paymentStartDate,
          termsSummary,
          clientMessage,

          offerStatus,
          updatedBy: user.email,
          updatedAt: serverTimestamp(),
        },
        "adminReview.membershipOfferNotes": adminNotes,
        "adminReview.membershipOfferUpdatedBy": user.email,
        "adminReview.membershipOfferUpdatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Membership offer saved.");
    } catch (error) {
      console.error(error);
      setActionError("Could not save membership offer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendOfferToClient() {
    if (!selectedApplication) return;

    if (!clientMessage.trim()) {
      setActionError("Add a client message before sending.");
      return;
    }

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      let conversationId = selectedApplication.conversationId || null;

      if (!conversationId) {
        const conversationRef = await addDoc(collection(db, "conversations"), {
          clientUid: selectedApplication.clientUid,
          clientEmail: selectedApplication.clientEmail || "",
          clientName: selectedApplication.clientName || "Client",

          applicationId: selectedApplication.id,
          consultRequestId: null,
          membershipChangeRequestId: null,
          sourceType: "membershipApplication",
          sourceId: selectedApplication.id,

          assignedInbox: selectedApplication.assignedInbox || "general",
          assignedArtistId: selectedApplication.assignedArtistId || null,

          subject: `Tattoo Project Membership Offer - ${getTierLabel(offerTier)}`,

          status: "open",
          lastMessagePreview: clientMessage.trim().slice(0, 180),
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
          lastMessagePreview: clientMessage.trim().slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: false,
          unreadForClient: true,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "messages"), {
        conversationId,
        applicationId: selectedApplication.id,
        consultRequestId: null,
        membershipChangeRequestId: null,
        sourceType: "membershipApplication",
        sourceId: selectedApplication.id,

        clientUid: selectedApplication.clientUid,
        clientEmail: selectedApplication.clientEmail || "",

        senderUid: user.uid,
        senderRole: "admin",
        senderName: user.displayName|| "Fawcett Tattoos & Art Studio",

        body: clientMessage.trim(),

        createdAt: serverTimestamp(),
      });

      const applicationRef = doc(
        db,
        "membershipApplications",
        selectedApplication.id
      );

      await updateDoc(applicationRef, {
        status: "membership_offer_sent",
        conversationId,
        membershipOffer: {
          tier: offerTier,
          tierLabel: getTierLabel(offerTier),

          initialPaymentDollars: initialPayment,
          monthlyPaymentDollars: monthlyPayment,
          minimumProjectValueDollars: minimumProjectValue,

          initialPaymentCents: dollarsToCents(initialPayment),
          monthlyPaymentCents: dollarsToCents(monthlyPayment),
          minimumProjectValueCents: dollarsToCents(minimumProjectValue),

          paymentStartDate,
          termsSummary,
          clientMessage: clientMessage.trim(),

          offerStatus: "membership_offer_sent",
          sentBy: user.email,
          sentAt: serverTimestamp(),
          updatedBy: user.email,
          updatedAt: serverTimestamp(),
        },
        "adminReview.membershipOfferNotes": adminNotes,
        "adminReview.membershipOfferSentBy": user.email,
        "adminReview.membershipOfferSentAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setOfferStatus("membership_offer_sent");
      setActionSuccess("Membership offer saved and sent to tattoo portal.");
    } catch (error) {
      console.error(error);
      setActionError(
        "Could not send offer. Check conversation and message Firestore rules."
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
          <h1>Membership Offers</h1>

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
          <h1>Membership Offers</h1>

          <p>
            Review new membership applications and prepare Starter, Builder,
            Commitment, or custom payment structures.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
          </Link>

          <Link className="button button-secondary" href="/admin/applications">
            Applications
          </Link>

          <Link className="button button-secondary" href="/admin/membership-requests">
            Membership Requests
          </Link>

          <Link className="button button-secondary" href="/admin/membership-offer-responses">
            Offer Responses
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

      <section className="membership-offer-summary-grid">
        <article className="portal-stat-card">
          <p>Total Applications</p>
          <strong>{totals.total}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Review Needed</p>
          <strong>{totals.reviewNeeded}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Offers Sent</p>
          <strong>{totals.offersSent}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Approved / Active</p>
          <strong>{totals.approvedOrActive}</strong>
        </article>
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
                {offerStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tier
              <select
                value={tierFilter}
                onChange={(event) => setTierFilter(event.target.value)}
              >
                <option value="all">All tiers</option>
                {tierOptions.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredApplications.length === 0 ? (
            <p>No membership applications found.</p>
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
                    <strong>{application.clientName || "Client"}</strong>
                    <span>{application.clientEmail}</span>
                  </div>

                  <p>
                    Interested tier:{" "}
                    {formatValue(application.budget?.tierInterest)}
                  </p>

                  <div className="application-card-meta">
                    <small>{getStatusLabel(application.status || "review_needed")}</small>
                    <small>
                      Offer:{" "}
                      {getTierLabel(
                        application.membershipOffer?.tier ||
                          application.budget?.tierInterest ||
                          "custom"
                      )}
                    </small>
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
                Choose a membership application to prepare or send a membership
                offer.
              </p>
            </div>
          ) : (
            <article className="admin-card membership-offer-card">
              <p className="eyebrow">Membership Offer</p>
              <h2>{selectedApplication.clientName || "Client"}</h2>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client</h3>

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
                    <strong>Submitted:</strong>{" "}
                    {formatDate(selectedApplication.createdAt)}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Application</h3>

                  <p>
                    <strong>Preferred Artist:</strong>{" "}
                    {formatValue(selectedApplication.preferredArtist)}
                  </p>

                  <p>
                    <strong>Interested Tier:</strong>{" "}
                    {formatValue(selectedApplication.budget?.tierInterest)}
                  </p>

                  <p>
                    <strong>Monthly Comfort:</strong>{" "}
                    {formatValue(selectedApplication.budget?.monthlyComfort)}
                  </p>

                  <p>
                    <strong>Timeline:</strong>{" "}
                    {formatValue(selectedApplication.timeline?.startWindow)}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Project Idea</h3>

                  <p>
                    <strong>Placement:</strong>{" "}
                    {formatValue(selectedApplication.project?.placement)}
                  </p>

                  <p>
                    <strong>Size / Detail:</strong>{" "}
                    {formatValue(selectedApplication.project?.sizeDetail)}
                  </p>

                  <div className="admin-note-box">
                    {selectedApplication.project?.tattooIdea ||
                      "No tattoo idea provided."}
                  </div>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Offer Builder</h3>

                  <form className="membership-offer-form">
                    <label>
                      Offer Status
                      <select
                        value={offerStatus}
                        onChange={(event) => setOfferStatus(event.target.value)}
                      >
                        {offerStatusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Approved Tier
                      <select
                        value={offerTier}
                        onChange={(event) => applyTierDefaults(event.target.value)}
                      >
                        {tierOptions.map((tier) => (
                          <option key={tier.value} value={tier.value}>
                            {tier.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Initial Payment
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={initialPayment}
                        onChange={(event) => setInitialPayment(event.target.value)}
                      />
                    </label>

                    <label>
                      Monthly Payment
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={monthlyPayment}
                        onChange={(event) => setMonthlyPayment(event.target.value)}
                      />
                    </label>

                    <label>
                      Minimum Project Value
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={minimumProjectValue}
                        onChange={(event) =>
                          setMinimumProjectValue(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Payment Start Date
                      <input
                        type="date"
                        value={paymentStartDate}
                        onChange={(event) =>
                          setPaymentStartDate(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Terms Summary
                      <textarea
                        value={termsSummary}
                        onChange={(event) => setTermsSummary(event.target.value)}
                        rows={5}
                      />
                    </label>

                    <label>
                      Internal Admin Notes
                      <textarea
                        value={adminNotes}
                        onChange={(event) => setAdminNotes(event.target.value)}
                        rows={4}
                        placeholder="Private admin notes. Example: client is better suited for Builder because sleeve concept needs more sessions."
                      />
                    </label>

                    <label>
                    Tattoo Portal Message
                      <textarea
                        value={clientMessage}
                        onChange={(event) => setClientMessage(event.target.value)}
                        rows={9}
                      />
                    </label>
                  </form>

                  <div className="membership-offer-preview">
                    <strong>Offer Snapshot</strong>
                    <p>
                      {getTierLabel(offerTier)} · Initial{" "}
                      {formatMoneyFromCents(dollarsToCents(initialPayment))} ·
                      Monthly{" "}
                      {formatMoneyFromCents(dollarsToCents(monthlyPayment))} ·
                      Minimum Project{" "}
                      {formatMoneyFromCents(
                        dollarsToCents(minimumProjectValue)
                      )}
                    </p>
                  </div>

                  <div className="membership-offer-button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={saveOfferDraft}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Offer Draft"}
                    </button>

                    <button
                      className="button button-primary"
                      type="button"
                      onClick={sendOfferToClient}
                      disabled={isSaving}
                    >
                      {isSaving ? "Sending..." : "Save + Send Offer"}
                    </button>
                  </div>
                </article>
              </div>

              <div className="membership-admin-notice">
                <strong>Reminder:</strong> This is an offer workflow, not an
                automatic enrollment. Confirm full terms, required costs,
                scheduling expectations, and payment handling before activating a
                client membership.
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}