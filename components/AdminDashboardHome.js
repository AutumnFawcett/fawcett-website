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

function getActivityTime(item) {
  return (
    timestampToMillis(item.lastMessageAt) ||
    timestampToMillis(item.updatedAt) ||
    timestampToMillis(item.createdAt) ||
    timestampToMillis(item.receivedAt) ||
    timestampToMillis(item.startAt)
  );
}

function getItemLabel(item) {
  if (item.kind === "message") return item.subject || "Client Message";
  if (item.kind === "consult") return item.clientName || "Consult Request";
  if (item.kind === "application") return item.clientName || "Membership Application";
  if (item.kind === "appointment") return item.title || "Appointment";
  if (item.kind === "payment") return item.clientName || "Payment";
  if (item.kind === "offerResponse") return item.clientName || "Offer Response";
  if (item.kind === "membershipRequest") return item.clientName || "Membership Request";
  if (item.kind === "project") return item.projectName || "Tattoo Project";

  return "Activity";
}

export default function AdminDashboardHome() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [nowMillis, setNowMillis] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [clients, setClients] = useState([]);
  const [consults, setConsults] = useState([]);
  const [applications, setApplications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [membershipChangeRequests, setMembershipChangeRequests] = useState([]);
  const [offerResponses, setOfferResponses] = useState([]);

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    function updateNow() {
      setNowMillis(Date.now());
    }

    updateNow();

    const timer = setInterval(updateNow, 60000);

    return () => clearInterval(timer);
  }, []);

  const unreadAdminMessages = useMemo(() => {
    return conversations.filter((conversation) => conversation.unreadForAdmin);
  }, [conversations]);

  const newConsults = useMemo(() => {
    return consults.filter((consult) => {
      return !consult.status || consult.status === "new";
    });
  }, [consults]);

  const newApplications = useMemo(() => {
    return applications.filter((application) => {
      return (
        !application.status ||
        application.status === "new" ||
        application.status === "review_needed"
      );
    });
  }, [applications]);

  const offersSent = useMemo(() => {
    return applications.filter((application) => {
      return application.status === "membership_offer_sent";
    });
  }, [applications]);

  const newOfferResponses = useMemo(() => {
    return offerResponses.filter((response) => {
      return !response.responseStatus || response.responseStatus === "new";
    });
  }, [offerResponses]);

  const newMembershipRequests = useMemo(() => {
    return membershipChangeRequests.filter((request) => {
      return (
        !request.requestStatus ||
        request.requestStatus === "new" ||
        request.requestStatus === "reviewing"
      );
    });
  }, [membershipChangeRequests]);

  const upcomingAppointments = useMemo(() => {
    if (!nowMillis) return [];

    return appointments
      .filter((appointment) => {
        const startMillis = timestampToMillis(appointment.startAt);

        if (!startMillis) return false;

        return startMillis >= nowMillis && appointment.status !== "cancelled";
      })
      .sort(
        (a, b) =>
          timestampToMillis(a.startAt) - timestampToMillis(b.startAt)
      );
  }, [appointments, nowMillis]);

  const activeProjects = useMemo(() => {
    return projects.filter((project) => {
      return !["completed", "cancelled", "declined"].includes(project.status);
    });
  }, [projects]);

  const paymentSummary = useMemo(() => {
    return payments.reduce(
      (summary, payment) => {
        const amount = Number(payment.amountCents || 0);

        if (isCountedPayment(payment)) {
          summary.totalRecordedCents += amount;
        }

        summary.activeCreditCents += getCreditDeltaCents(payment);

        if (payment.paymentMethod === "afterpay_financing") {
          summary.afterpayCents += amount;
        }

        return summary;
      },
      {
        totalRecordedCents: 0,
        activeCreditCents: 0,
        afterpayCents: 0,
      }
    );
  }, [payments]);

  const recentActivity = useMemo(() => {
    const activityItems = [
      ...conversations.map((item) => ({ ...item, kind: "message" })),
      ...consults.map((item) => ({ ...item, kind: "consult" })),
      ...applications.map((item) => ({ ...item, kind: "application" })),
      ...appointments.map((item) => ({ ...item, kind: "appointment" })),
      ...payments.map((item) => ({ ...item, kind: "payment" })),
      ...membershipChangeRequests.map((item) => ({
        ...item,
        kind: "membershipRequest",
      })),
      ...offerResponses.map((item) => ({ ...item, kind: "offerResponse" })),
      ...projects.map((item) => ({ ...item, kind: "project" })),
    ];

    return activityItems
      .filter((item) => getActivityTime(item))
      .sort((a, b) => getActivityTime(b) - getActivityTime(a))
      .slice(0, 8);
  }, [
    conversations,
    consults,
    applications,
    appointments,
    payments,
    membershipChangeRequests,
    offerResponses,
    projects,
  ]);

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
      setClients,
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
      "Could not load membership applications. Check Firestore rules."
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

    subscribeToCollection(
      "membershipChangeRequests",
      setMembershipChangeRequests,
      "Could not load membership requests. Check Firestore rules."
    );

    subscribeToCollection(
      "membershipOfferResponses",
      setOfferResponses,
      "Could not load offer responses. Check Firestore rules."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

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
          <h1>Dashboard</h1>

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
          <h1>Dashboard</h1>

          <p>
            Studio overview for clients, consults, projects, appointments,
            payments, memberships, and messages.
          </p>
        </div>

        <div className="admin-header-actions">
          <Link className="button button-secondary" href="/admin/inbox">
            Inbox
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

      {actionError && <p className="error-message">{actionError}</p>}

      <section className="admin-dashboard-money-grid">
        <article className="admin-dashboard-money-card admin-dashboard-money-card-blue">
          <p>Total Recorded Payments</p>
          <strong>
            {formatMoneyFromCents(paymentSummary.totalRecordedCents)}
          </strong>
          <span>Paid and partially paid records</span>
        </article>

        <article className="admin-dashboard-money-card">
          <p>Active In-Studio Credit</p>
          <strong>{formatMoneyFromCents(paymentSummary.activeCreditCents)}</strong>
          <span>Calculated from payment records</span>
        </article>

        <article className="admin-dashboard-money-card">
          <p>Afterpay / Financing</p>
          <strong>{formatMoneyFromCents(paymentSummary.afterpayCents)}</strong>
          <span>Track fee-heavy payment activity</span>
        </article>
      </section>

      <section className="admin-dashboard-stat-grid">
        <article className="portal-stat-card">
          <p>Unread Messages</p>
          <strong>{unreadAdminMessages.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>New Consults</p>
          <strong>{newConsults.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Applications</p>
          <strong>{applications.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Upcoming Appointments</p>
          <strong>{upcomingAppointments.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Active Projects</p>
          <strong>{activeProjects.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Offers Sent</p>
          <strong>{offersSent.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Offer Responses</p>
          <strong>{newOfferResponses.length}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Payment Requests</p>
          <strong>{newMembershipRequests.length}</strong>
        </article>
      </section>

      <section className="admin-dashboard-layout">
        <article className="admin-card admin-dashboard-card">
          <div className="panel-heading">
            <h2>Needs Attention</h2>
            <p>
              {unreadAdminMessages.length +
                newConsults.length +
                newApplications.length +
                newOfferResponses.length +
                newMembershipRequests.length}
            </p>
          </div>

          <div className="mini-record-list">
            <Link className="mini-record-card mini-record-link" href="/admin/inbox">
              <strong>Unread Messages</strong>
              <span>{unreadAdminMessages.length} waiting for admin review</span>
            </Link>

            <Link
              className="mini-record-card mini-record-link"
              href="/admin/consults"
            >
              <strong>New Consults</strong>
              <span>{newConsults.length} new consult requests</span>
            </Link>

            <Link
              className="mini-record-card mini-record-link"
              href="/admin/membership-offers"
            >
              <strong>Membership Applications</strong>
              <span>{newApplications.length} need review or offer setup</span>
            </Link>

            <Link
              className="mini-record-card mini-record-link"
              href="/admin/membership-offer-responses"
            >
              <strong>Offer Responses</strong>
              <span>{newOfferResponses.length} new client responses</span>
            </Link>

            <Link
              className="mini-record-card mini-record-link"
              href="/admin/membership-requests"
            >
              <strong>Payment Change Requests</strong>
              <span>{newMembershipRequests.length} pause/cancel/change requests</span>
            </Link>
          </div>
        </article>

        <article className="admin-card admin-dashboard-card">
          <div className="panel-heading">
            <h2>Upcoming Appointments</h2>
            <p>{upcomingAppointments.length}</p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p>No upcoming appointments yet.</p>
          ) : (
            <div className="mini-record-list">
              {upcomingAppointments.slice(0, 5).map((appointment) => (
                <div key={appointment.id} className="mini-record-card">
                  <strong>{appointment.title || "Studio Appointment"}</strong>
                  <span>{appointment.clientName || appointment.clientEmail}</span>
                  <span>
                    {formatDate(appointment.startAt)} ·{" "}
                    {formatValue(appointment.status)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="portal-card-action">
            <Link className="button button-secondary" href="/admin/schedule">
              Open Schedule
            </Link>
          </div>
        </article>

        <article className="admin-card admin-dashboard-card">
          <div className="panel-heading">
            <h2>Recent Activity</h2>
            <p>{recentActivity.length}</p>
          </div>

          {recentActivity.length === 0 ? (
            <p>No recent activity yet.</p>
          ) : (
            <div className="mini-record-list">
              {recentActivity.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="mini-record-card">
                  <strong>{getItemLabel(item)}</strong>
                  <span>{formatValue(item.kind)}</span>
                  <span>{formatDate(getActivityTime(item))}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="admin-card admin-dashboard-card">
          <div className="panel-heading">
            <h2>Quick Actions</h2>
            <p>Admin</p>
          </div>

          <div className="admin-dashboard-action-grid">
            <Link className="button button-primary" href="/admin/inbox">
              Inbox
            </Link>

            <Link className="button button-secondary" href="/admin/intake">
              Intake
            </Link>

            <Link className="button button-secondary" href="/admin/clients">
              Clients
            </Link>

            <Link className="button button-secondary" href="/admin/consults">
              Consults
            </Link>

            <Link
              className="button button-secondary"
              href="/admin/applications"
            >
              Applications
            </Link>

            <Link
              className="button button-secondary"
              href="/admin/membership-offers"
            >
              Membership Offers
            </Link>

            <Link
              className="button button-secondary"
              href="/admin/membership-offer-responses"
            >
              Offer Responses
            </Link>

            <Link
              className="button button-secondary"
              href="/admin/membership-requests"
            >
              Membership Requests
            </Link>

            <Link className="button button-secondary" href="/admin/projects">
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

            <Link
              className="button button-secondary"
              href="/admin/credit-ledger"
            >
              Credit Ledger
            </Link>
          </div>

          <div className="admin-dashboard-note">
            <strong>Reminder:</strong> Membership approvals, payment changes,
            credit balances, and project estimates should be reviewed before
            confirming anything with a client.
          </div>
        </article>
      </section>
    </main>
  );
}