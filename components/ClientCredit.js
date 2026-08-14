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
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

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

function isCountedPayment(payment) {
  return payment.status === "paid" || payment.status === "partial";
}

function getCreditDeltaCents(payment) {
  if (!isCountedPayment(payment)) return 0;

  const amount = Number(payment.amountCents || 0);

  if (payment.creditHandling === "adds_in_studio_credit") {
    return amount;
  }

  if (payment.creditHandling === "uses_in_studio_credit") {
    return -amount;
  }

  if (payment.creditHandling === "refunds_or_removes_credit") {
    return -amount;
  }

  return 0;
}

function getCreditLabel(payment) {
  if (payment.creditHandling === "adds_in_studio_credit") {
    return "Credit Added";
  }

  if (payment.creditHandling === "uses_in_studio_credit") {
    return "Credit Used";
  }

  if (payment.creditHandling === "refunds_or_removes_credit") {
    return "Credit Removed / Refunded";
  }

  return "No Credit Change";
}

export default function ClientCredit() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

const [payments, setPayments] = useState([]);

const [requestType, setRequestType] = useState("pause_monthly_payments");
const [requestReason, setRequestReason] = useState("");
const [requestSuccess, setRequestSuccess] = useState("");
const [requestError, setRequestError] = useState("");
const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

const [authError, setAuthError] = useState("");
const [loadError, setLoadError] = useState("");

  const creditEntries = useMemo(() => {
    return payments
      .map((payment) => ({
        ...payment,
        deltaCents: getCreditDeltaCents(payment),
        creditLabel: getCreditLabel(payment),
      }))
      .filter((payment) => payment.deltaCents !== 0)
      .sort((a, b) => {
        const bTime =
          timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
        const aTime =
          timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

        return bTime - aTime;
      });
  }, [payments]);

  const creditSummary = useMemo(() => {
    return creditEntries.reduce(
      (summary, entry) => {
        if (entry.creditHandling === "adds_in_studio_credit") {
          summary.creditAddedCents += Number(entry.amountCents || 0);
        }

        if (entry.creditHandling === "uses_in_studio_credit") {
          summary.creditUsedCents += Number(entry.amountCents || 0);
        }

        if (entry.creditHandling === "refunds_or_removes_credit") {
          summary.creditRemovedCents += Number(entry.amountCents || 0);
        }

        summary.balanceCents += Number(entry.deltaCents || 0);

        return summary;
      },
      {
        balanceCents: 0,
        creditAddedCents: 0,
        creditUsedCents: 0,
        creditRemovedCents: 0,
      }
    );
  }, [creditEntries]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);

      if (currentUser?.email) {
        setEmail(currentUser.email);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const paymentsQuery = query(
      collection(db, "payments"),
      where("clientUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const nextPayments = snapshot.docs.map((paymentDoc) => ({
          id: paymentDoc.id,
          ...paymentDoc.data(),
        }));

        setPayments(nextPayments);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load credit records.");
      }
    );

    return () => unsubscribe();
  }, [user]);

async function submitMembershipChangeRequest(event) {
  event.preventDefault();

  if (!user) return;

  if (!requestReason.trim()) {
    setRequestError("Please add a short reason or note for the studio.");
    return;
  }

  setIsSubmittingRequest(true);
  setRequestError("");
  setRequestSuccess("");

  try {
    await addDoc(collection(db, "membershipChangeRequests"), {
      clientUid: user.uid,
      clientEmail: user.email || "",
      clientName: user.displayName || user.email || "Client",

      requestType,
      requestStatus: "new",

      currentCreditBalanceCents: creditSummary.balanceCents,
      totalCreditAddedCents: creditSummary.creditAddedCents,
      totalCreditUsedCents: creditSummary.creditUsedCents,

      reason: requestReason.trim(),

      clientAcknowledgement: {
        understandsThisIsARequest: true,
        understandsStudioMustReview: true,
        understandsCreditBalanceDoesNotAutomaticallyDisappear: true,
      },

      adminReview: {
        internalNotes: "",
        reviewedBy: "",
        reviewedAt: null,
      },

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setRequestSuccess(
      "Request sent. The studio will review it and reply through your tattoo portal."
    );
    setRequestReason("");
    setRequestType("pause_monthly_payments");
  } catch (error) {
    console.error(error);
    setRequestError("Could not send request. Please message the studio.");
  } finally {
    setIsSubmittingRequest(false);
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

  if (!authChecked) {
    return (
      <main className="portal-page">
        <section className="portal-card">
          <p>Checking login...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="portal-page">
        <section className="portal-card portal-login-card">
          <p className="eyebrow">Tattoo Portal</p>
          <h1>In-Studio Credit</h1>

          <p>Log in to view your tattoo credit balance and credit history.</p>

          <form className="portal-form" onSubmit={handleLogin}>
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

  return (
    <main className="portal-page">
      <section className="portal-header">
        <div>
          <p className="eyebrow">Tattoo Portal</p>
          <h1>In-Studio Credit</h1>

          <p>
            View your current credit balance and the payment records that add,
            use, or remove credit from your account.
          </p>
        </div>

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>

          <Link className="button button-secondary" href="/portal/project-timeline">
            Timeline
          </Link>

          <Link className="button button-secondary" href="/consult">
            New Consult
          </Link>

          <Link className="button button-secondary" href="/portal/membership-offers">
            Membership Offers
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

      {loadError && <p className="error-message">{loadError}</p>}

      <section className="client-credit-summary-grid">
        <article className="client-credit-balance-card">
          <p>Current In-Studio Credit Balance</p>
          <strong>{formatMoneyFromCents(creditSummary.balanceCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Total Added</p>
          <strong>{formatMoneyFromCents(creditSummary.creditAddedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Total Used</p>
          <strong>{formatMoneyFromCents(creditSummary.creditUsedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Entries</p>
          <strong>{creditEntries.length}</strong>
        </article>
      </section>

      <section className="portal-credit-layout">
        <article className="portal-card">
          <div className="panel-heading">
            <h2>Credit History</h2>
            <p>{creditEntries.length}</p>
          </div>

          {creditEntries.length === 0 ? (
            <div className="empty-state">
              <h3>No credit entries yet.</h3>
              <p>
                Once the studio records a membership payment, in-studio credit,
                credit use, refund, or credit adjustment, it will appear here.
              </p>
            </div>
          ) : (
            <div className="client-credit-entry-list">
              {creditEntries.map((entry) => (
                <article key={entry.id} className="client-credit-entry-card">
                  <div>
                    <strong>{entry.creditLabel}</strong>
                    <span>{formatDate(entry.receivedAt)}</span>
                  </div>

                  <div>
                    <p>
                      {formatValue(entry.paymentType)} ·{" "}
                      {formatValue(entry.paymentMethod)}
                    </p>

                    <p>Status: {formatValue(entry.status)}</p>

                    {entry.projectName ? (
                      <p>Project: {entry.projectName}</p>
                    ) : null}

                    {entry.appointmentTitle ? (
                      <p>Appointment: {entry.appointmentTitle}</p>
                    ) : null}

                    {entry.reference ? (
                      <p>Reference: {entry.reference}</p>
                    ) : null}
                  </div>

                  <strong
                    className={
                      entry.deltaCents >= 0
                        ? "client-credit-positive"
                        : "client-credit-negative"
                    }
                  >
                    {entry.deltaCents >= 0 ? "+" : "-"}
                    {formatMoneyFromCents(Math.abs(entry.deltaCents))}
                  </strong>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="portal-card">
          <h2>How This Balance Works</h2>

          <div className="mini-record-list">
            <div className="mini-record-card">
              <strong>Membership payments</strong>
              <span>
                Membership initial and monthly payments can add In-Studio Credit
                when recorded by the studio.
              </span>
            </div>

            <div className="mini-record-card">
              <strong>Credit use</strong>
              <span>
                When credit is used toward an approved tattoo session or project,
                it lowers the available balance.
              </span>
            </div>

            <div className="mini-record-card">
              <strong>Pending payments</strong>
              <span>
                Pending, failed, and cancelled payments do not count toward your
                active balance.
              </span>
            </div>

            <div className="mini-record-card">
              <strong>Final confirmation</strong>
              <span>
                Studio records are reviewed by admin. Message us if anything
                looks incorrect.
              </span>
            </div>
          </div>

          <div className="portal-card-action">
            <Link className="button button-primary" href="/portal/messages">
              Message the Studio
            </Link>
          </div>
        </article>

        <article className="portal-card membership-request-card">
        <h2>Membership Payment Requests</h2>

            <p className="portal-muted-text">
                Need to pause or cancel monthly membership payments? Submit a request for
                studio review. This does not automatically cancel appointments, erase credit,
                or change your account until the studio confirms it.
            </p>

            <form className="portal-form membership-request-form" onSubmit={submitMembershipChangeRequest}>
                <label>
                Request Type
                <select
                    value={requestType}
                    onChange={(event) => setRequestType(event.target.value)}
                >
                    <option value="pause_monthly_payments">
                    Suspend / Pause Monthly Payments
                    </option>
                    <option value="cancel_monthly_payments">
                    Cancel Monthly Membership Payments
                    </option>
                    <option value="resume_monthly_payments">
                    Resume Monthly Payments
                    </option>
                    <option value="change_monthly_amount">
                    Request Monthly Amount Change
                    </option>
                </select>
                </label>

                <label>
                Reason / Notes
                <textarea
                    value={requestReason}
                    onChange={(event) => setRequestReason(event.target.value)}
                    rows={4}
                    placeholder="Example: I need to pause for one month, or I need to cancel monthly payments but keep my available credit on account."
                    required
                />
                </label>

                <div className="membership-request-notice">
                <strong>Important:</strong> This is a request for studio review. Your
                available In-Studio Credit balance remains on account according to studio
                terms unless the studio confirms otherwise in writing.
                </div>

                {requestSuccess && <p className="success-message">{requestSuccess}</p>}
                {requestError && <p className="error-message">{requestError}</p>}

                <button
                className="button button-primary"
                type="submit"
                disabled={isSubmittingRequest}
                >
                {isSubmittingRequest ? "Sending..." : "Send Request"}
                </button>
            </form>
        </article>

      </section>
    </main>
  );
}