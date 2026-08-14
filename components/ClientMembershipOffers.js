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
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
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

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
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

function buildResponseMessage({ responseType, offer, note }) {
  const tierLabel = offer?.tierLabel || formatValue(offer?.tier);

  if (responseType === "request_accept_offer") {
    return `Hi, I would like to request to accept the Tattoo Project Membership offer.

Offer: ${tierLabel}
Initial payment: ${formatMoneyFromCents(offer?.initialPaymentCents)}
Monthly payment: ${formatMoneyFromCents(offer?.monthlyPaymentCents)}
Minimum project value: ${formatMoneyFromCents(offer?.minimumProjectValueCents)}

My note:
${note || "I would like to move forward with this offer."}`;
  }

  if (responseType === "ask_question") {
    return `Hi, I have a question about my Tattoo Project Membership offer.

Offer: ${tierLabel}

My question:
${note || "I have a question about the offer."}`;
  }

  if (responseType === "decline_offer") {
    return `Hi, I would like to decline this Tattoo Project Membership offer for now.

Offer: ${tierLabel}

My note:
${note || "I am not ready to move forward at this time."}`;
  }

  return note || "Membership offer response.";
}

export default function ClientMembershipOffers() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [applications, setApplications] = useState([]);
  const [responses, setResponses] = useState([]);

  const [notesByApplicationId, setNotesByApplicationId] = useState({});
  const [savingApplicationId, setSavingApplicationId] = useState("");

  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const offers = useMemo(() => {
    return applications
      .filter((application) => {
        return (
          application.membershipOffer?.tier ||
          application.status === "membership_offer_sent" ||
          application.status === "client_reviewing_offer" ||
          application.status === "membership_approved" ||
          application.status === "membership_active"
        );
      })
      .sort((a, b) => timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt));
  }, [applications]);

  const responsesByApplicationId = useMemo(() => {
    const responseMap = new Map();

    responses.forEach((response) => {
      if (!response.applicationId) return;

      if (!responseMap.has(response.applicationId)) {
        responseMap.set(response.applicationId, []);
      }

      responseMap.get(response.applicationId).push(response);
    });

    responseMap.forEach((items) => {
      items.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    });

    return responseMap;
  }, [responses]);

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

    const applicationsQuery = query(
      collection(db, "membershipApplications"),
      where("clientUid", "==", user.uid)
    );

    const responsesQuery = query(
      collection(db, "membershipOfferResponses"),
      where("clientUid", "==", user.uid)
    );

    const unsubscribeApplications = onSnapshot(
      applicationsQuery,
      (snapshot) => {
        const nextApplications = snapshot.docs.map((applicationDoc) => ({
          id: applicationDoc.id,
          ...applicationDoc.data(),
        }));

        setApplications(nextApplications);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load membership offers.");
      }
    );

    const unsubscribeResponses = onSnapshot(
      responsesQuery,
      (snapshot) => {
        const nextResponses = snapshot.docs.map((responseDoc) => ({
          id: responseDoc.id,
          ...responseDoc.data(),
        }));

        setResponses(nextResponses);
        setLoadError("");
      },
      (error) => {
        console.error(error);
        setLoadError("Could not load offer responses.");
      }
    );

    return () => {
      unsubscribeApplications();
      unsubscribeResponses();
    };
  }, [user]);

  function updateNote(applicationId, value) {
    setNotesByApplicationId((currentNotes) => ({
      ...currentNotes,
      [applicationId]: value,
    }));
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

  async function submitOfferResponse(application, responseType) {
    if (!user) return;

    const note = notesByApplicationId[application.id] || "";
    const offer = application.membershipOffer || {};

    if (responseType === "ask_question" && !note.trim()) {
      setActionError("Please add your question before sending.");
      return;
    }

    if (responseType === "decline_offer" && !note.trim()) {
      setActionError("Please add a short note before declining.");
      return;
    }

    setSavingApplicationId(application.id);
    setActionError("");
    setActionSuccess("");

    try {
      const responseRef = await addDoc(collection(db, "membershipOfferResponses"), {
        clientUid: user.uid,
        clientEmail: user.email || application.clientEmail || "",
        clientName: application.clientName || user.displayName || user.email || "Client",

        applicationId: application.id,
        responseType,
        responseLabel: getResponseLabel(responseType),
        responseStatus: "new",

        clientNote: note.trim(),

        offerSnapshot: {
          tier: offer.tier || "",
          tierLabel: offer.tierLabel || "",
          initialPaymentCents: offer.initialPaymentCents || 0,
          monthlyPaymentCents: offer.monthlyPaymentCents || 0,
          minimumProjectValueCents: offer.minimumProjectValueCents || 0,
          paymentStartDate: offer.paymentStartDate || "",
          termsSummary: offer.termsSummary || "",
        },

        adminReview: {
          internalNotes: "",
          reviewedBy: "",
          reviewedAt: null,
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const messageBody = buildResponseMessage({
        responseType,
        offer,
        note: note.trim(),
      });

      let conversationId = application.conversationId || null;

      if (!conversationId) {
        const conversationRef = await addDoc(collection(db, "conversations"), {
          clientUid: user.uid,
          clientEmail: user.email || application.clientEmail || "",
          clientName: application.clientName || user.displayName || user.email || "Client",

          applicationId: application.id,
          consultRequestId: null,
          membershipChangeRequestId: null,
          membershipOfferResponseId: responseRef.id,
          sourceType: "membershipOfferResponse",
          sourceId: responseRef.id,

          assignedInbox: application.assignedInbox || "general",
          assignedArtistId: application.assignedArtistId || null,

          subject: `Membership Offer Response - ${
            offer.tierLabel || formatValue(offer.tier)
          }`,

          status: "open",
          lastMessagePreview: messageBody.slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: true,
          unreadForClient: false,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        conversationId = conversationRef.id;
      } else {
        const conversationRef = doc(db, "conversations", conversationId);

        await updateDoc(conversationRef, {
          lastMessagePreview: messageBody.slice(0, 180),
          lastMessageAt: serverTimestamp(),
          unreadForAdmin: true,
          unreadForClient: false,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "messages"), {
        conversationId,
        applicationId: application.id,
        consultRequestId: null,
        membershipChangeRequestId: null,
        membershipOfferResponseId: responseRef.id,
        sourceType: "membershipOfferResponse",
        sourceId: responseRef.id,

        clientUid: user.uid,
        clientEmail: user.email || application.clientEmail || "",

        senderUid: user.uid,
        senderRole: "client",
        senderName: user.displayName || "Client",

        body: messageBody,

        createdAt: serverTimestamp(),
      });

      updateNote(application.id, "");
      setActionSuccess(
        "Response sent. The studio will review it and reply through your tattoo portal."
      );
    } catch (error) {
      console.error(error);
      setActionError(
        "Could not send response. Please try again or message the studio."
      );
    } finally {
      setSavingApplicationId("");
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
          <h1>Membership Offers</h1>

          <p>Log in to view and respond to your membership offer.</p>

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
          <h1>Membership Offers</h1>

          <p>
            Review your Tattoo Project Membership offer and request to accept,
            decline, or ask a question.
          </p>
        </div> 

        <div className="portal-header-actions">
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>

          <Link className="button button-secondary" href="/portal/messages">
            Messages
          </Link>

          <Link className="button button-secondary" href="/portal/credit">
            Credit
          </Link>

          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>

  `        <button
            className="button button-secondary"
            type="button"
            onClick={async () => {
              await signOut(auth);
              router.push("/tattoo-portal");
            }}
          >
            Log Out
          </button>`
        </div>
      </section>

      {loadError && <p className="error-message">{loadError}</p>}
      {actionError && <p className="error-message">{actionError}</p>}
      {actionSuccess && <p className="success-message">{actionSuccess}</p>}

      <section className="client-offers-layout">
        {offers.length === 0 ? (
          <article className="portal-card">
            <h2>No membership offers yet.</h2>
            <p>
              Once the studio reviews your Tattoo Project Membership application
              and sends an offer, it will appear here.
            </p>

            <div className="portal-card-action">
              <Link
                className="button button-primary"
                href="/tattoo-project-membership"
              >
                Apply for Membership
              </Link>
            </div>
          </article>
        ) : (
          offers.map((application) => {
            const offer = application.membershipOffer || {};
            const applicationResponses =
              responsesByApplicationId.get(application.id) || [];
            const latestResponse = applicationResponses[0] || null;
            const noteValue = notesByApplicationId[application.id] || "";
            const isSavingThis = savingApplicationId === application.id;

            return (
              <article key={application.id} className="portal-card client-offer-card">
                <div className="client-offer-header">
                  <div>
                    <p className="eyebrow">Tattoo Project Membership Offer</p>
                    <h2>{offer.tierLabel || formatValue(offer.tier)}</h2>
                    <p>
                      Status: <strong>{formatValue(application.status)}</strong>
                    </p>
                  </div>

                  <div className="client-offer-date">
                    <span>Sent / Updated</span>
                    <strong>{formatDate(offer.sentAt || offer.updatedAt)}</strong>
                  </div>
                </div>

                <section className="client-offer-amount-grid">
                  <article className="portal-stat-card">
                    <p>Initial Payment</p>
                    <strong>{formatMoneyFromCents(offer.initialPaymentCents)}</strong>
                  </article>

                  <article className="portal-stat-card">
                    <p>Monthly Payment</p>
                    <strong>{formatMoneyFromCents(offer.monthlyPaymentCents)}</strong>
                  </article>

                  <article className="portal-stat-card">
                    <p>Minimum Project</p>
                    <strong>
                      {formatMoneyFromCents(offer.minimumProjectValueCents)}
                    </strong>
                  </article>
                </section>

                <div className="client-offer-detail-grid">
                  <article className="mini-record-card">
                    <strong>Payment Start Date</strong>
                    <span>{offer.paymentStartDate || "To be confirmed"}</span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Project Idea</strong>
                    <span>
                      {application.project?.tattooIdea || "No project idea provided."}
                    </span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Terms Summary</strong>
                    <span>
                      {offer.termsSummary ||
                        "Full terms will be confirmed before enrollment."}
                    </span>
                  </article>

                  <article className="mini-record-card">
                    <strong>Important</strong>
                    <span>
                      This is not a flat-rate tattoo package. Payments build
                      In-Studio Credit toward an approved tattoo project. Final
                      project cost depends on size, placement, complexity, artist,
                      skin, cover-up needs, design changes, healing, and session
                      time.
                    </span>
                  </article>
                </div>

                {latestResponse ? (
                  <div className="client-offer-response-box">
                    <strong>Latest Response</strong>
                    <p>
                      {getResponseLabel(latestResponse.responseType)} ·{" "}
                      {formatDate(latestResponse.createdAt)}
                    </p>

                    {latestResponse.clientNote ? (
                      <p>{latestResponse.clientNote}</p>
                    ) : null}
                  </div>
                ) : null}

                <form className="client-offer-response-form">
                  <label>
                    Note / Question
                    <textarea
                      value={noteValue}
                      onChange={(event) =>
                        updateNote(application.id, event.target.value)
                      }
                      rows={4}
                      placeholder="Add a note before requesting to accept, asking a question, or declining."
                    />
                  </label>

                  <div className="client-offer-button-row">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={isSavingThis}
                      onClick={() =>
                        submitOfferResponse(application, "request_accept_offer")
                      }
                    >
                      {isSavingThis ? "Sending..." : "Request to Accept Offer"}
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={isSavingThis}
                      onClick={() =>
                        submitOfferResponse(application, "ask_question")
                      }
                    >
                      Ask a Question
                    </button>

                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={isSavingThis}
                      onClick={() =>
                        submitOfferResponse(application, "decline_offer")
                      }
                    >
                      Decline Offer
                    </button>
                  </div>
                </form>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}