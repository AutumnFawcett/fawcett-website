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

function getClientKey(record) {
  return record.clientUid || record.clientEmail || record.email || record.id || "";
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

export default function AdminCreditLedger() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [clientProfiles, setClientProfiles] = useState([]);
  const [payments, setPayments] = useState([]);

  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [searchText, setSearchText] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");

  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");

  const clientLedger = useMemo(() => {
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
          balanceCents: 0,
          creditAddedCents: 0,
          creditUsedCents: 0,
          creditRemovedCents: 0,
          transactions: [],
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

    payments.forEach((payment) => {
      const client = ensureClient(payment);

      if (!client) return;

      const deltaCents = getCreditDeltaCents(payment);

      if (!deltaCents) return;

      client.balanceCents += deltaCents;

      if (payment.creditHandling === "adds_in_studio_credit") {
        client.creditAddedCents += Number(payment.amountCents || 0);
      }

      if (payment.creditHandling === "uses_in_studio_credit") {
        client.creditUsedCents += Number(payment.amountCents || 0);
      }

      if (payment.creditHandling === "refunds_or_removes_credit") {
        client.creditRemovedCents += Number(payment.amountCents || 0);
      }

      client.transactions.push({
        ...payment,
        deltaCents,
        creditLabel: getCreditLabel(payment),
      });
    });

    return Array.from(clientMap.values())
      .map((client) => ({
        ...client,
        transactions: client.transactions.sort((a, b) => {
          const bTime =
            timestampToMillis(b.receivedAt) || timestampToMillis(b.createdAt);
          const aTime =
            timestampToMillis(a.receivedAt) || timestampToMillis(a.createdAt);

          return bTime - aTime;
        }),
      }))
      .sort((a, b) => b.balanceCents - a.balanceCents);
  }, [clientProfiles, payments]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return clientLedger.filter((client) => {
      if (balanceFilter === "has_credit" && client.balanceCents <= 0) {
        return false;
      }

      if (balanceFilter === "zero_or_less" && client.balanceCents > 0) {
        return false;
      }

      if (!normalizedSearch) return true;

      const searchableText = [
        client.clientName,
        client.clientEmail,
        client.phone,
        client.instagram,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [clientLedger, searchText, balanceFilter]);

  const selectedClient = useMemo(() => {
    return (
      clientLedger.find((client) => client.key === selectedClientKey) || null
    );
  }, [clientLedger, selectedClientKey]);

  const totals = useMemo(() => {
    return clientLedger.reduce(
      (summary, client) => {
        summary.totalActiveCreditCents += client.balanceCents;
        summary.totalCreditAddedCents += client.creditAddedCents;
        summary.totalCreditUsedCents += client.creditUsedCents;
        summary.totalCreditRemovedCents += client.creditRemovedCents;

        if (client.balanceCents > 0) {
          summary.clientsWithCredit += 1;
        }

        return summary;
      },
      {
        totalActiveCreditCents: 0,
        totalCreditAddedCents: 0,
        totalCreditUsedCents: 0,
        totalCreditRemovedCents: 0,
        clientsWithCredit: 0,
      }
    );
  }, [clientLedger]);

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
      "payments",
      setPayments,
      "Could not load payments. Check Firestore rules."
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
          <h1>Credit Ledger</h1>

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
          <h1>Credit Ledger</h1>

          <p>
            Track client In-Studio Credit balances from membership payments,
            tattoo credit payments, credit use, refunds, and removals.
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

          <Link className="button button-secondary" href="/admin/payments">
            Payments
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

      <section className="credit-summary-grid">
        <article className="portal-stat-card">
          <p>Active In-Studio Credit</p>
          <strong>{formatMoneyFromCents(totals.totalActiveCreditCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Credit Added</p>
          <strong>{formatMoneyFromCents(totals.totalCreditAddedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Credit Used</p>
          <strong>{formatMoneyFromCents(totals.totalCreditUsedCents)}</strong>
        </article>

        <article className="portal-stat-card">
          <p>Clients With Credit</p>
          <strong>{totals.clientsWithCredit}</strong>
        </article>
      </section>

      <section className="admin-applications-layout">
        <aside className="applications-list-panel">
          <div className="panel-heading">
            <h2>Clients</h2>
            <p>{filteredClients.length}</p>
          </div>

          <div className="admin-filters">
            <label>
              Search
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Name, email, phone..."
              />
            </label>

            <label>
              Balance
              <select
                value={balanceFilter}
                onChange={(event) => setBalanceFilter(event.target.value)}
              >
                <option value="all">All clients</option>
                <option value="has_credit">Has active credit</option>
                <option value="zero_or_less">Zero or negative balance</option>
              </select>
            </label>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {filteredClients.length === 0 ? (
            <p>No clients found.</p>
          ) : (
            <div className="application-list">
              {filteredClients.map((client) => (
                <button
                  key={client.key}
                  type="button"
                  className={
                    selectedClientKey === client.key
                      ? "application-card application-card-active"
                      : "application-card"
                  }
                  onClick={() => setSelectedClientKey(client.key)}
                >
                  <div>
                    <strong>{client.clientName}</strong>
                    <span>{client.clientEmail}</span>
                  </div>

                  <p>
                    Balance:{" "}
                    <strong>{formatMoneyFromCents(client.balanceCents)}</strong>
                  </p>

                  <div className="application-card-meta">
                    <small>
                      Added {formatMoneyFromCents(client.creditAddedCents)}
                    </small>
                    <small>
                      Used {formatMoneyFromCents(client.creditUsedCents)}
                    </small>
                  </div>

                  <small>{client.transactions.length} credit entries</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="application-detail-panel">
          {!selectedClient ? (
            <div className="empty-state">
              <h2>Select a client</h2>
              <p>
                Choose a client to review their In-Studio Credit balance and
                transaction history.
              </p>
            </div>
          ) : (
            <article className="admin-card credit-ledger-card">
              <p className="eyebrow">Client Credit</p>
              <h2>{selectedClient.clientName}</h2>

              <div className="credit-balance-callout">
                <p>Current In-Studio Credit Balance</p>
                <strong>
                  {formatMoneyFromCents(selectedClient.balanceCents)}
                </strong>
              </div>

              <div className="detail-grid">
                <article className="detail-card">
                  <h3>Client</h3>

                  <p>
                    <strong>Email:</strong>{" "}
                    {selectedClient.clientEmail || "Not provided"}
                  </p>

                  <p>
                    <strong>Phone:</strong>{" "}
                    {selectedClient.phone || "Not provided"}
                  </p>

                  <p>
                    <strong>Instagram:</strong>{" "}
                    {selectedClient.instagram || "Not provided"}
                  </p>
                </article>

                <article className="detail-card">
                  <h3>Credit Summary</h3>

                  <p>
                    <strong>Total Added:</strong>{" "}
                    {formatMoneyFromCents(selectedClient.creditAddedCents)}
                  </p>

                  <p>
                    <strong>Total Used:</strong>{" "}
                    {formatMoneyFromCents(selectedClient.creditUsedCents)}
                  </p>

                  <p>
                    <strong>Total Removed / Refunded:</strong>{" "}
                    {formatMoneyFromCents(selectedClient.creditRemovedCents)}
                  </p>

                  <p>
                    <strong>Entries:</strong>{" "}
                    {selectedClient.transactions.length}
                  </p>
                </article>
              </div>

              <section className="credit-ledger-section">
                <div className="panel-heading">
                  <h3>Ledger Entries</h3>
                  <p>{selectedClient.transactions.length}</p>
                </div>

                {selectedClient.transactions.length === 0 ? (
                  <p>No credit entries yet.</p>
                ) : (
                  <div className="credit-entry-list">
                    {selectedClient.transactions.map((transaction) => (
                      <article
                        key={transaction.id}
                        className="credit-entry-card"
                      >
                        <div>
                          <strong>{transaction.creditLabel}</strong>
                          <span>{formatDate(transaction.receivedAt)}</span>
                        </div>

                        <div>
                          <p>
                            {formatValue(transaction.paymentType)} ·{" "}
                            {formatValue(transaction.paymentMethod)}
                          </p>

                          {transaction.projectName ? (
                            <p>Project: {transaction.projectName}</p>
                          ) : null}

                          {transaction.appointmentTitle ? (
                            <p>Appointment: {transaction.appointmentTitle}</p>
                          ) : null}

                          {transaction.reference ? (
                            <p>Reference: {transaction.reference}</p>
                          ) : null}

                          {transaction.adminReview?.internalNotes ? (
                            <p>
                              Notes: {transaction.adminReview.internalNotes}
                            </p>
                          ) : null}
                        </div>

                        <strong
                          className={
                            transaction.deltaCents >= 0
                              ? "credit-positive"
                              : "credit-negative"
                          }
                        >
                          {transaction.deltaCents >= 0 ? "+" : "-"}
                          {formatMoneyFromCents(
                            Math.abs(transaction.deltaCents)
                          )}
                        </strong>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <div className="credit-ledger-note">
                <strong>Important:</strong> This balance is calculated from
                payment records marked as paid or partially paid. Pending,
                failed, and cancelled payments do not count toward the active
                credit balance.
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}