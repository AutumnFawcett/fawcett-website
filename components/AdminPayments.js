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

const paymentTypeOptions = [
  { value: "consult_fee", label: "Consult Fee" },
  { value: "booking_fee_deposit", label: "Booking Fee / Deposit" },
  { value: "tattoo_session_payment", label: "Tattoo Session Payment" },
  { value: "design_fee", label: "Design Fee" },
  { value: "supply_fee", label: "Supply Fee" },
  { value: "touch_up_fee", label: "Touch-Up Fee" },
  { value: "membership_initial_payment", label: "Membership Initial Payment" },
  { value: "membership_monthly_payment", label: "Membership Monthly Payment" },
  { value: "product_aftercare", label: "Product / Aftercare" },
  { value: "refund", label: "Refund" },
  { value: "other", label: "Other" },
];

const paymentMethodOptions = [
  { value: "cash", label: "Cash" },
  { value: "etransfer", label: "E-transfer" },
  { value: "debit", label: "Debit" },
  { value: "credit_card", label: "Credit Card" },
  { value: "square", label: "Square" },
  { value: "stripe", label: "Stripe" },
  { value: "afterpay_financing", label: "Afterpay / Financing" },
  {
    value: "gift_certificate_tattoo_credit",
    label: "Gift Certificate / Tattoo Credit",
  },
  { value: "in_studio_credit", label: "In-Studio Credit" },
  { value: "other", label: "Other" },
];

const creditHandlingOptions = [
  { value: "none", label: "No Credit Change" },
  { value: "adds_in_studio_credit", label: "Adds In-Studio Credit" },
  { value: "uses_in_studio_credit", label: "Uses In-Studio Credit" },
  {
    value: "refunds_or_removes_credit",
    label: "Refunds / Removes In-Studio Credit",
  },
];

const paymentStatusOptions = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partially Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
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

function dollarsToCents(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.round(numberValue * 100);
}

function getClientKey(record) {
  return record.clientUid || record.clientEmail || record.email || record.id || "";
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_RECEIVED_DATE = getTodayInputValue();


export default function AdminPayments() {
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

  const [selectedPaymentId, setSelectedPaymentId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  const [paymentClientKey, setPaymentClientKey] = useState("");
  const [paymentProjectId, setPaymentProjectId] = useState("");
  const [paymentAppointmentId, setPaymentAppointmentId] = useState("");
  const [paymentType, setPaymentType] = useState("tattoo_session_payment");
  const [paymentMethod, setPaymentMethod] = useState("etransfer");
  const [creditHandling, setCreditHandling] = useState("none");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [amountDollars, setAmountDollars] = useState("");
  const [receivedDate, setReceivedDate] = useState(DEFAULT_RECEIVED_DATE);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [selectedStatusDraft, setSelectedStatusDraft] = useState("paid");
  const [selectedNotesDraft, setSelectedNotesDraft] = useState("");
  const [selectedReferenceDraft, setSelectedReferenceDraft] = useState("");

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

    return Array.from(clientMap.values()).sort((a, b) =>
      a.clientName.localeCompare(b.clientName)
    );
  }, [clientProfiles, consults, applications, projects, appointments]);

  const selectedPayment = useMemo(() => {
    return payments.find((payment) => payment.id === selectedPaymentId) || null;
  }, [payments, selectedPaymentId]);

  const availableProjects = useMemo(() => {
    if (!paymentClientKey) return [];

    return projects.filter((project) => {
      return getClientKey(project) === paymentClientKey;
    });
  }, [projects, paymentClientKey]);

  const availableAppointments = useMemo(() => {
    if (!paymentClientKey) return [];

    return appointments.filter((appointment) => {
      return getClientKey(appointment) === paymentClientKey;
    });
  }, [appointments, paymentClientKey]);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return payments
      .filter((payment) => {
        if (statusFilter !== "all" && payment.status !== statusFilter) {
          return false;
        }

        if (methodFilter !== "all" && payment.paymentMethod !== methodFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const searchableText = [
          payment.clientName,
          payment.clientEmail,
          payment.paymentType,
          payment.paymentMethod,
          payment.creditHandling,
          payment.status,
          payment.projectName,
          payment.appointmentTitle,
          payment.reference,
          payment.adminReview?.internalNotes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const bTime =
          timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
        const aTime =
          timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [payments, searchText, statusFilter, methodFilter]);

  const totals = useMemo(() => {
    return filteredPayments.reduce(
      (summary, payment) => {
        const amount = Number(payment.amountCents || 0);

        if (payment.status === "paid" || payment.status === "partial") {
          summary.totalRecordedCents += amount;
        }

        if (payment.paymentMethod === "afterpay_financing") {
          summary.afterpayCents += amount;
        }

        if (payment.paymentMethod === "in_studio_credit") {
          summary.inStudioCreditUsedCents += amount;
        }

        if (payment.creditHandling === "adds_in_studio_credit") {
          summary.creditAddedCents += amount;
        }

        if (payment.creditHandling === "uses_in_studio_credit") {
          summary.creditUsedCents += amount;
        }

        return summary;
      },
      {
        totalRecordedCents: 0,
        afterpayCents: 0,
        inStudioCreditUsedCents: 0,
        creditAddedCents: 0,
        creditUsedCents: 0,
      }
    );
  }, [filteredPayments]);

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

    subscribeToCollection(
      "payments",
      setPayments,
      "Could not load payments. Check Firestore rules."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

  function handlePaymentTypeChange(nextPaymentType) {
  setPaymentType(nextPaymentType);

  if (
    nextPaymentType === "membership_initial_payment" ||
    nextPaymentType === "membership_monthly_payment"
  ) {
    setCreditHandling("adds_in_studio_credit");
  }
}

function handlePaymentMethodChange(nextPaymentMethod) {
  setPaymentMethod(nextPaymentMethod);

  if (nextPaymentMethod === "in_studio_credit") {
    setCreditHandling("uses_in_studio_credit");
  }
}

  function handleSelectPayment(payment) {
    setSelectedPaymentId(payment.id);
    setSelectedStatusDraft(payment.status || "paid");
    setSelectedNotesDraft(payment.adminReview?.internalNotes || "");
    setSelectedReferenceDraft(payment.reference || "");
    setActionError("");
    setActionSuccess("");
  }

  function handleClientChange(nextClientKey) {
    setPaymentClientKey(nextClientKey);
    setPaymentProjectId("");
    setPaymentAppointmentId("");
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

  async function createPayment(event) {
    event.preventDefault();

    const client = clients.find((item) => item.key === paymentClientKey);

    if (!client) {
      setActionError("Choose a client before recording a payment.");
      return;
    }

    if (!client.clientUid) {
      setActionError(
        "This client does not have a client UID yet. Save their client profile first."
      );
      return;
    }

    const amountCents = dollarsToCents(amountDollars);

    if (!amountCents || amountCents <= 0) {
      setActionError("Enter a payment amount greater than $0.");
      return;
    }

    if (
      paymentMethod === "afterpay_financing" &&
      amountCents > 40000
    ) {
      setActionError(
        "Afterpay / Financing is currently capped at $400. Use another payment method or split the payment."
      );
      return;
    }

    const selectedProject = projects.find(
      (project) => project.id === paymentProjectId
    );

    const selectedAppointment = appointments.find(
      (appointment) => appointment.id === paymentAppointmentId
    );

    const receivedAt = receivedDate
      ? new Date(`${receivedDate}T12:00:00`)
      : new Date();

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      await addDoc(collection(db, "payments"), {
        clientUid: client.clientUid,
        clientName: client.clientName || "",
        clientEmail: client.clientEmail || "",
        phone: client.phone || "",
        instagram: client.instagram || "",

        projectId: selectedProject?.id || null,
        projectName: selectedProject?.projectName || "",

        appointmentId: selectedAppointment?.id || null,
        appointmentTitle: selectedAppointment?.title || "",

        paymentType,
        paymentMethod,
        creditHandling,
        status: paymentStatus,

        amountCents,
        amountDisplay: formatMoneyFromCents(amountCents),
        currency: "CAD",

        receivedAt,
        reference: paymentReference.trim(),

        afterpayPolicy: {
          studioCapCents: 40000,
          requiresAdminOverrideAboveCents: 40000,
        },

        adminReview: {
          internalNotes: paymentNotes.trim(),
          createdBy: user.email,
          createdAt: serverTimestamp(),
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Payment recorded.");
      setAmountDollars("");
      setPaymentReference("");
      setPaymentNotes("");
      setPaymentProjectId("");
      setPaymentAppointmentId("");
      setPaymentType("tattoo_session_payment");
      setPaymentMethod("etransfer");
      setCreditHandling("none");
      setPaymentStatus("paid");
    } catch (error) {
      console.error(error);
      setActionError("Could not record payment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSelectedPayment() {
    if (!selectedPayment) return;

    setIsSaving(true);
    setActionError("");
    setActionSuccess("");

    try {
      const paymentRef = doc(db, "payments", selectedPayment.id);

      await updateDoc(paymentRef, {
        status: selectedStatusDraft,
        reference: selectedReferenceDraft,
        "adminReview.internalNotes": selectedNotesDraft,
        "adminReview.lastUpdatedBy": user.email,
        "adminReview.lastUpdatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setActionSuccess("Payment updated.");
    } catch (error) {
      console.error(error);
      setActionError("Could not update payment.");
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
          <h1>Payments</h1>

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
          <h1>Payments</h1>

          <p>
            Manually record cash, e-transfer, card, financing, membership
            payments, and in-studio credit use.
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

          <Link className="button button-secondary" href="/admin/schedule">
            Schedule
          </Link>

          <Link className="button button-secondary" href="/admin/projects">
            Projects
          </Link>

        <Link className="button button-secondary" href="/admin/project-timeline">
             Timeline
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

      <section className="payment-summary-grid">
        <article className="portal-stat-card">
          <p>Total Recorded</p>
          <strong>{formatMoneyFromCents(totals.totalRecordedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Afterpay / Financing</p>
          <strong>{formatMoneyFromCents(totals.afterpayCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Credit Added</p>
          <strong>{formatMoneyFromCents(totals.creditAddedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Credit Used</p>
          <strong>{formatMoneyFromCents(totals.creditUsedCents)}</strong>
        </article>
      </section>

      <section className="admin-applications-layout">
        <aside className="applications-list-panel">
          <div className="panel-heading">
            <h2>Payments</h2>
            <p>{filteredPayments.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, type, reference..."
              />
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {paymentStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Method
              <select
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value)}
              >
                <option value="all">All methods</option>
                {paymentMethodOptions.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredPayments.length === 0 ? (
            <p>No payments recorded yet.</p>
          ) : (
            <div className="application-list">
              {filteredPayments.map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  className={
                    selectedPaymentId === payment.id
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => handleSelectPayment(payment)}
                >
                  <div>
                    <strong>{formatMoneyFromCents(payment.amountCents)}</strong>
                    <span>{payment.clientEmail}</span>
                  </div>

                  <p>
                    {formatValue(payment.paymentType)} ·{" "}
                    {formatValue(payment.paymentMethod)}
                  </p>

                  <div className="application-card-meta">
                    <small>{formatValue(payment.status)}</small>
                    <small>{formatValue(payment.creditHandling)}</small>
                  </div>

                  <small>{formatDate(payment.receivedAt)}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          <article className="admin-card payment-create-card">
            <p className="eyebrow">Record Payment</p>
            <h2>Add a payment or in-studio credit transaction</h2>

            <form className="admin-form payment-form" onSubmit={createPayment}>
              <label>
                Client
                <select
                  value={paymentClientKey}
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
                  value={paymentProjectId}
                  onChange={(event) => setPaymentProjectId(event.target.value)}
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
                Related Appointment
                <select
                  value={paymentAppointmentId}
                  onChange={(event) =>
                    setPaymentAppointmentId(event.target.value)
                  }
                >
                  <option value="">No appointment selected</option>
                  {availableAppointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.title || "Appointment"} —{" "}
                      {formatDate(appointment.startAt)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payment Type
                <select
                value={paymentType}
                onChange={(event) => handlePaymentTypeChange(event.target.value)}
                >
                  {paymentTypeOptions.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payment Method
                <select
                value={paymentMethod}
                onChange={(event) => handlePaymentMethodChange(event.target.value)}
                >
                  {paymentMethodOptions.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Credit Handling
                <select
                  value={creditHandling}
                  onChange={(event) => setCreditHandling(event.target.value)}
                >
                  {creditHandlingOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={paymentStatus}
                  onChange={(event) => setPaymentStatus(event.target.value)}
                >
                  {paymentStatusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountDollars}
                  onChange={(event) => setAmountDollars(event.target.value)}
                  placeholder="Example: 500"
                  required
                />
              </label>

              <label>
                Date Received
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(event) => setReceivedDate(event.target.value)}
                  required
                />
              </label>

              <label>
                Reference / Receipt
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="E-transfer confirmation, Square receipt, note..."
                />
              </label>

              <label>
                Internal Notes
                <textarea
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  rows={4}
                  placeholder="Private admin notes for this payment."
                />
              </label>

              <div className="payment-policy-note">
                <strong>Afterpay / Financing cap:</strong> current studio cap is
                $400 per transaction. For larger balances, split payment or use
                another method.
              </div>

              <button
                className="button button-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Recording..." : "Record Payment"}
              </button>
            </form>
          </article>

          {!selectedPayment ? (
            <div className="empty-state">
              <h2>Select a payment</h2>
              <p>
                Choose a payment from the list to review or update its status,
                reference, and internal notes.
              </p>
            </div>
          ) : (
            <article className="admin-card payment-selected-card">
              <p className="eyebrow">Payment Details</p>
              <h2>{formatMoneyFromCents(selectedPayment.amountCents)}</h2>

              {actionSuccess && (
                <p className="success-message">{actionSuccess}</p>
              )}

              {actionError && <p className="error-message">{actionError}</p>}

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client</h3>

                  <p>
                    <strong>Name:</strong>{" "}
                    {selectedPayment.clientName || "Not provided"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedPayment.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedPayment.phone || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Payment</h3>

                  <p>
                    <strong>Type:</strong>{" "}
                    {formatValue(selectedPayment.paymentType)}
                  </p>

                  <p>
                    <strong>Method:</strong>{" "}
                    {formatValue(selectedPayment.paymentMethod)}
                  </p>

                  <p>
                    <strong>Credit Handling:</strong>{" "}
                    {formatValue(selectedPayment.creditHandling)}
                  </p>

                  <p>
                    <strong>Date:</strong>{" "}
                    {formatDate(selectedPayment.receivedAt)}
                  </p>
                </article>

                <article className="detail-card detail-card-wide">
                  <h3>Edit Payment</h3>

                  <label>
                    Status
                    <select
                      value={selectedStatusDraft}
                      onChange={(event) =>
                        setSelectedStatusDraft(event.target.value)
                      }
                      disabled={isSaving}
                    >
                      {paymentStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Reference / Receipt
                    <input
                      type="text"
                      value={selectedReferenceDraft}
                      onChange={(event) =>
                        setSelectedReferenceDraft(event.target.value)
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
                    onClick={saveSelectedPayment}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Payment"}
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