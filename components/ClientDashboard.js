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
  onSnapshot,
  query,
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

function getLatestActivity(items) {
  return items.reduce((latest, item) => {
    const createdAt = timestampToMillis(item.createdAt);
    const updatedAt = timestampToMillis(item.updatedAt);
    const lastMessageAt = timestampToMillis(item.lastMessageAt);
    const receivedAt = timestampToMillis(item.receivedAt);
    const startAt = timestampToMillis(item.startAt);

    return Math.max(
      latest,
      createdAt,
      updatedAt,
      lastMessageAt,
      receivedAt,
      startAt
    );
  }, 0);
}

function getMembershipOfferStatus(application) {
  if (!application) return "No active offer";

  if (application.status) {
    return formatValue(application.status);
  }

  if (application.membershipOffer?.offerStatus) {
    return formatValue(application.membershipOffer.offerStatus);
  }

  return "Application Submitted";
}

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [nowMillis, setNowMillis] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [clientProfile, setClientProfile] = useState(null);
  const [consults, setConsults] = useState([]);
  const [applications, setApplications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [offerResponses, setOfferResponses] = useState([]);
  const [membershipChangeRequests, setMembershipChangeRequests] = useState([]);

  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    function updateNow() {
      setNowMillis(Date.now());
    }

    updateNow();

    const timer = setInterval(updateNow, 60000);

    return () => clearInterval(timer);
  }, []);

  const creditSummary = useMemo(() => {
    return payments.reduce(
      (summary, payment) => {
        const delta = getCreditDeltaCents(payment);

        if (payment.creditHandling === "adds_in_studio_credit" && delta > 0) {
          summary.creditAddedCents += Number(payment.amountCents || 0);
        }

        if (payment.creditHandling === "uses_in_studio_credit" && delta < 0) {
          summary.creditUsedCents += Number(payment.amountCents || 0);
        }

        if (
          payment.creditHandling === "refunds_or_removes_credit" &&
          delta < 0
        ) {
          summary.creditRemovedCents += Number(payment.amountCents || 0);
        }

        summary.balanceCents += delta;

        return summary;
      },
      {
        balanceCents: 0,
        creditAddedCents: 0,
        creditUsedCents: 0,
        creditRemovedCents: 0,
      }
    );
  }, [payments]);

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

  const unreadConversations = useMemo(() => {
    return conversations.filter((conversation) => conversation.unreadForClient);
  }, [conversations]);

  const latestMembershipApplication = useMemo(() => {
    return [...applications].sort((a, b) => {
      const bTime = timestampToMillis(b.updatedAt) || timestampToMillis(b.createdAt);
      const aTime = timestampToMillis(a.updatedAt) || timestampToMillis(a.createdAt);

      return bTime - aTime;
    })[0] || null;
  }, [applications]);

  const latestOfferResponse = useMemo(() => {
    return [...offerResponses].sort(
      (a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
    )[0] || null;
  }, [offerResponses]);

  const latestMembershipChangeRequest = useMemo(() => {
    return [...membershipChangeRequests].sort(
      (a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
    )[0] || null;
  }, [membershipChangeRequests]);

  const latestActivityMillis = useMemo(() => {
    return getLatestActivity([
      clientProfile,
      ...consults,
      ...applications,
      ...projects,
      ...conversations,
      ...appointments,
      ...payments,
      ...offerResponses,
      ...membershipChangeRequests,
    ].filter(Boolean));
  }, [
    clientProfile,
    consults,
    applications,
    projects,
    conversations,
    appointments,
    payments,
    offerResponses,
    membershipChangeRequests,
  ]);

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

    const unsubscribers = [];

    const clientRef = doc(db, "clients", user.uid);

    const unsubscribeClient = onSnapshot(
      clientRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setClientProfile({
            id: snapshot.id,
            ...snapshot.data(),
          });
        } else {
          setClientProfile(null);
        }

        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load client profile.");
      }
    );

    unsubscribers.push(unsubscribeClient);

    function subscribeToOwnCollection(collectionName, setter, errorMessage) {
      const collectionQuery = query(
        collection(db, collectionName),
        where("clientUid", "==", user.uid)
      );

      const unsubscribe = onSnapshot(
        collectionQuery,
        (snapshot) => {
          const nextItems = snapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
          }));

          setter(nextItems);
          setLoadError("");
        },
        (error) => {
          console.error(error);
          setLoadError(errorMessage);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    subscribeToOwnCollection(
      "consultRequests",
      setConsults,
      "Could not load consult requests."
    );

    subscribeToOwnCollection(
      "membershipApplications",
      setApplications,
      "Could not load membership applications."
    );

    subscribeToOwnCollection(
      "projects",
      setProjects,
      "Could not load projects."
    );

    subscribeToOwnCollection(
      "conversations",
      setConversations,
      "Could not load conversations."
    );

    subscribeToOwnCollection(
      "appointments",
      setAppointments,
      "Could not load appointments."
    );

    subscribeToOwnCollection(
      "payments",
      setPayments,
      "Could not load payment records."
    );

    subscribeToOwnCollection(
      "membershipOfferResponses",
      setOfferResponses,
      "Could not load membership offer responses."
    );

    subscribeToOwnCollection(
      "membershipChangeRequests",
      setMembershipChangeRequests,
      "Could not load membership change requests."
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

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
          <h1>Client Dashboard</h1>

          <p>
            Log in to view your tattoo requests, project updates, credit,
            appointments, and studio messages.
          </p>

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

          <div className="portal-action-row">
            <Link className="button button-secondary" href="/consult">
              Start a Consult
            </Link>

            <Link
              className="button button-secondary"
              href="/tattoo-project-membership"
            >
              Project Membership
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-page">
      <section className="portal-header">
        <div>
          <p className="eyebrow">Tattoo Portal</p>
          <h1>Dashboard</h1>

          <p>
            Welcome back,{" "}
            <strong>
              {clientProfile?.clientName || user.displayName || user.email}
            </strong>
            .
          </p>
        </div>

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link className="button button-secondary" href="/portal/credit">
            Credit
          </Link>

          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>
          <Link className="button button-secondary" href="/portal/project-timeline">
            Timeline
          </Link>

          <Link
            className="button button-secondary"
            href="/portal/membership-offers"
          >
            Membership Offers
          </Link>

          <Link className="button button-secondary" href="/consult">
            New Consult
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

      <section className="dashboard-hero-grid">
        <article className="dashboard-credit-card">
          <p>Current In-Studio Credit</p>
          <strong>{formatMoneyFromCents(creditSummary.balanceCents)}</strong>
          <span>
            Added {formatMoneyFromCents(creditSummary.creditAddedCents)} · Used{" "}
            {formatMoneyFromCents(creditSummary.creditUsedCents)}
          </span>

          <Link className="button button-primary" href="/portal/credit">
            View Credit History
          </Link>
        </article>

        <article className="dashboard-status-card">
          <p className="eyebrow">Membership Status</p>
          <h2>{getMembershipOfferStatus(latestMembershipApplication)}</h2>

          {latestMembershipApplication?.membershipOffer ? (
            <p>
              Offer:{" "}
              <strong>
                {latestMembershipApplication.membershipOffer.tierLabel ||
                  formatValue(latestMembershipApplication.membershipOffer.tier)}
              </strong>
            </p>
          ) : (
            <p>No current membership offer on file.</p>
          )}

          <div className="dashboard-card-actions">
            <Link
              className="button button-secondary"
              href="/portal/membership-offers"
            >
              View Offers
            </Link>

            <Link
              className="button button-secondary"
              href="/tattoo-project-membership"
            >
              Apply
            </Link>
          </div>
        </article>
      </section>

      <section className="portal-dashboard-grid dashboard-tight-grid">
        <article className="portal-stat-card">
          <p>Unread Messages</p>
          <strong>{unreadConversations.length}</strong>
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
          <p>Membership Requests</p>
          <strong>{membershipChangeRequests.length}</strong>
        </article>
      </section>

      <section className="dashboard-overview-layout">
        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Upcoming Appointments</h2>
            <p>{upcomingAppointments.length}</p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p>No upcoming appointments yet.</p>
          ) : (
            <div className="mini-record-list">
              {upcomingAppointments.slice(0, 3).map((appointment) => (
                <div key={appointment.id} className="mini-record-card">
                  <strong>{appointment.title || "Studio Appointment"}</strong>
                  <span>{formatDate(appointment.startAt)}</span>
                  <span>
                    {formatValue(appointment.appointmentType)} ·{" "}
                    {formatValue(appointment.status)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="portal-card-action">
            <Link className="button button-secondary" href="/portal/appointments">
              View Appointments
            </Link>
          </div>
        </article>

        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Messages</h2>
            <p>{conversations.length}</p>
          </div>

          {conversations.length === 0 ? (
            <p>No conversations yet.</p>
          ) : (
            <div className="mini-record-list">
              {conversations
                .slice()
                .sort(
                  (a, b) =>
                    timestampToMillis(b.lastMessageAt) -
                    timestampToMillis(a.lastMessageAt)
                )
                .slice(0, 3)
                .map((conversation) => (
                  <div key={conversation.id} className="mini-record-card">
                    <strong>{conversation.subject || "Studio Message"}</strong>
                    <span>
                      {conversation.lastMessagePreview ||
                        "No preview available"}
                    </span>
                    <span>{formatDate(conversation.lastMessageAt)}</span>
                  </div>
                ))}
            </div>
          )}

          <div className="portal-card-action">
            <Link className="button button-secondary" href="/portal/messages">
              Open Messages
            </Link>
          </div>
        </article>

        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Membership Offer Response</h2>
            <p>{offerResponses.length}</p>
          </div>

          {latestOfferResponse ? (
            <div className="mini-record-list">
              <div className="mini-record-card">
                <strong>{formatValue(latestOfferResponse.responseType)}</strong>
                <span>Status: {formatValue(latestOfferResponse.responseStatus)}</span>
                <span>{formatDate(latestOfferResponse.createdAt)}</span>
              </div>
            </div>
          ) : (
            <p>No membership offer responses yet.</p>
          )}

          <div className="portal-card-action">
            <Link
              className="button button-secondary"
              href="/portal/membership-offers"
            >
              View Membership Offers
            </Link>
          </div>
        </article>

        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Payment Change Requests</h2>
            <p>{membershipChangeRequests.length}</p>
          </div>

          {latestMembershipChangeRequest ? (
            <div className="mini-record-list">
              <div className="mini-record-card">
                <strong>{formatValue(latestMembershipChangeRequest.requestType)}</strong>
                <span>
                  Status:{" "}
                  {formatValue(latestMembershipChangeRequest.requestStatus)}
                </span>
                <span>{formatDate(latestMembershipChangeRequest.createdAt)}</span>
              </div>
            </div>
          ) : (
            <p>No payment change requests yet.</p>
          )}

          <div className="portal-card-action">
            <Link className="button button-secondary" href="/portal/credit">
              Request Pause / Cancel
            </Link>
          </div>
        </article>

        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Projects</h2>
            <p>{projects.length}</p>
          </div>

          {projects.length === 0 ? (
            <p>No tattoo projects have been created yet.</p>
          ) : (
            <div className="mini-record-list">
              {projects.slice(0, 3).map((project) => (
                <div key={project.id} className="mini-record-card">
                  <strong>{project.projectName || "Tattoo Project"}</strong>
                  <span>Status: {formatValue(project.status)}</span>
                  <span>Created: {formatDate(project.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="portal-card dashboard-overview-card">
          <div className="panel-heading">
            <h2>Latest Activity</h2>
            <p>{latestActivityMillis ? "Updated" : "None"}</p>
          </div>

          <div className="mini-record-list">
            <div className="mini-record-card">
              <strong>Last Account Activity</strong>
              <span>
                {latestActivityMillis
                  ? new Date(latestActivityMillis).toLocaleString("en-CA", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "No activity yet"}
              </span>
            </div>

            <div className="mini-record-card">
              <strong>Need help?</strong>
              <span>
                Message the studio if anything looks incorrect or if you need
                help with your project.
              </span>
            </div>
          </div>

          <div className="portal-card-action">
            <Link className="button button-primary" href="/portal/messages">
              Message the Studio
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}