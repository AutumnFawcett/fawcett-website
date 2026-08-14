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
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const inboxes = [
  {
    id: "general",
    label: "General",
    description: "General questions and undecided clients.",
  },
  {
    id: "ben",
    label: "Ben",
    description: "Clients assigned to Ben.",
  },
  {
    id: "autumn",
    label: "Autumn",
    description: "Clients assigned to Autumn.",
  },
];

function timestampToMillis(timestamp) {
  if (!timestamp) return 0;

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

export default function AdminInbox() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [activeInbox, setActiveInbox] = useState("general");
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);

  const [replyText, setReplyText] = useState("");
  const [authError, setAuthError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedInboxLabel = useMemo(() => {
    return inboxes.find((inbox) => inbox.id === activeInbox)?.label || "Inbox";
  }, [activeInbox]);

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

  const conversationsQuery = query(
    collection(db, "conversations"),
    where("assignedInbox", "==", activeInbox)
  );

  const unsubscribe = onSnapshot(
    conversationsQuery,
    (snapshot) => {
      const nextConversations = snapshot.docs
        .map((conversationDoc) => ({
          id: conversationDoc.id,
          ...conversationDoc.data(),
        }))
        .sort(
          (a, b) =>
            timestampToMillis(b.lastMessageAt) -
            timestampToMillis(a.lastMessageAt)
        );

      setConversations(nextConversations);
      setActionError("");
    },
    (error) => {
      console.error(error);
      setActionError("Could not load conversations. Check Firestore rules.");
    }
  );

  return () => unsubscribe();
}, [activeInbox, user, isAdmin]);
useEffect(() => {
  if (!selectedConversation) return;

  const messagesQuery = query(
    collection(db, "messages"),
    where("conversationId", "==", selectedConversation.id)
  );

  const unsubscribe = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const nextMessages = snapshot.docs
        .map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        }))
        .sort(
          (a, b) =>
            timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt)
        );

      setMessages(nextMessages);
      setActionError("");
    },
    (error) => {
      console.error(error);
      setActionError("Could not load messages.");
    }
  );

  return () => unsubscribe();
}, [selectedConversation]);

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

  async function handleSelectConversation(conversation) {
    setSelectedConversation(conversation);
    setActionError("");

    if (!conversation.unreadForAdmin) return;

    try {
      const conversationRef = doc(db, "conversations", conversation.id);

      await updateDoc(conversationRef, {
        unreadForAdmin: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function moveConversation(nextInbox) {
    if (!selectedConversation) return;

    setActionError("");

    try {
      const nextArtistId =
        nextInbox === "ben"
          ? "artist_ben"
          : nextInbox === "autumn"
            ? "artist_autumn"
            : null;

      const nextStatus =
        nextInbox === "general" ? "new" : `assigned_to_${nextInbox}`;

      const conversationRef = doc(db, "conversations", selectedConversation.id);

      await updateDoc(conversationRef, {
        assignedInbox: nextInbox,
        assignedArtistId: nextArtistId,
        status: nextStatus,
        unreadForAdmin: false,
        updatedAt: serverTimestamp(),
      });

      if (selectedConversation.applicationId) {
        const applicationRef = doc(
          db,
          "membershipApplications",
          selectedConversation.applicationId
        );

        await updateDoc(applicationRef, {
          assignedInbox: nextInbox,
          assignedArtistId: nextArtistId,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }

      setSelectedConversation(null);
      setMessages([]);
      setActiveInbox(nextInbox);
    } catch (error) {
      console.error(error);
      setActionError("Could not move this conversation.");
    }
  }

  async function sendReply(event) {
    event.preventDefault();

    if (!selectedConversation || !replyText.trim()) return;

    setIsSending(true);
    setActionError("");

    try {
      await addDoc(collection(db, "messages"), {
        conversationId: selectedConversation.id,
        applicationId: selectedConversation.applicationId || null,
        clientUid: selectedConversation.clientUid,

        senderUid: user.uid,
        senderRole: "admin",
        senderName: user.displayName || "Fawcett Tattoo & Art Studio",

        body: replyText.trim(),

        createdAt: serverTimestamp(),
      });

      const conversationRef = doc(db, "conversations", selectedConversation.id);

      await updateDoc(conversationRef, {
        lastMessagePreview: replyText.trim().slice(0, 140),
        lastMessageAt: serverTimestamp(),
        unreadForAdmin: false,
        unreadForClient: true,
        updatedAt: serverTimestamp(),
      });

      setReplyText("");
    } catch (error) {
      console.error(error);
      setActionError("Could not send reply.");
    } finally {
      setIsSending(false);
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
          <h1>Fawcett Admin Inbox</h1>

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
          <h1>Inbox</h1>
          <p>
            Review general questions, move clients to Ben or Autumn, and reply
            to message-style consults.
          </p>
        </div>

        <div className="admin-header-actions">

       <Link className="button button-secondary" href="/admin/intake">
          Intake
       </Link>
       <Link className="button button-secondary" href="/admin/clients">
          Clients
        </Link>
        <Link className="button button-secondary" href="/admin/applications">
            Applications
        </Link>
        <Link className="button button-secondary" href="/admin/consults">
            Consults
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

      <section className="admin-inbox-layout">
        <aside className="admin-sidebar">
          {inboxes.map((inbox) => (
          <button
            key={inbox.id}
            type="button"
            onClick={() => setActiveInbox(inbox.id)}
            className={
              activeInbox === inbox.id
                ? "inbox-card inbox-card-active"
                : "inbox-card"
            }
          >
            <span>{inbox.label}</span>
            <small>{inbox.description}</small>
          </button>
          ))}
        </aside>

        <section className="conversation-list-panel">
          <div className="panel-heading">
            <h2>{selectedInboxLabel}</h2>
            <p>{conversations.length} conversation(s)</p>
          </div>

          {actionError && <p className="error-message">{actionError}</p>}

          {conversations.length === 0 ? (
            <p>No conversations in this inbox yet.</p>
          ) : (
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={
                    selectedConversation?.id === conversation.id
                      ? "conversation-card conversation-card-active"
                      : "conversation-card"
                  }
                  onClick={() => handleSelectConversation(conversation)}
                >
                  <strong>
                    {conversation.clientName || "Unnamed client"}
                  </strong>

                  <span>{conversation.clientEmail}</span>

                  <p>
                    {conversation.lastMessagePreview ||
                      "No message preview available."}
                  </p>

                  <small>{formatDate(conversation.lastMessageAt)}</small>

                  {conversation.unreadForAdmin && (
                    <small className="unread-pill">Unread</small>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="message-panel">
          {!selectedConversation ? (
            <div className="empty-state">
              <h2>Select a conversation</h2>
              <p>
                Choose a client conversation from the list to read and reply.
              </p>
            </div>
          ) : (
            <>
              <div className="message-panel-header">
                <div>
                  <h2>{selectedConversation.clientName}</h2>
                  <p>{selectedConversation.clientEmail}</p>
                  <p>Status: {selectedConversation.status || "new"}</p>
                  <p>Inbox: {selectedConversation.assignedInbox}</p>
                </div>

                <div className="move-buttons">
                  <button
                    className="button button-small"
                    type="button"
                    onClick={() => moveConversation("general")}
                  >
                    Move to General
                  </button>

                  <button
                    className="button button-small"
                    type="button"
                    onClick={() => moveConversation("ben")}
                  >
                    Move to Ben
                  </button>

                  <button
                    className="button button-small"
                    type="button"
                    onClick={() => moveConversation("autumn")}
                  >
                    Move to Autumn
                  </button>
                </div>
              </div>

              <div className="message-thread">
                {messages.length === 0 ? (
                  <p>No messages yet.</p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        message.senderRole === "client"
                          ? "message-bubble client-message"
                          : "message-bubble admin-message"
                      }
                    >
                      <strong>
                        {message.senderName || message.senderRole}
                      </strong>

                      <p>{message.body}</p>

                      <small>{formatDate(message.createdAt)}</small>
                    </article>
                  ))
                )}
              </div>

              <form className="reply-form" onSubmit={sendReply}>
                <label>
                  Reply
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows={4}
                    placeholder="Write your reply..."
                    required
                  />
                </label>

                <button
                  className="button button-primary"
                  type="submit"
                  disabled={isSending}
                >
                  {isSending ? "Sending..." : "Send Reply"}
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}