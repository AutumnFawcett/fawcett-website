"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
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

function getInboxLabel(inbox) {
  if (inbox === "ben") return "Ben";
  if (inbox === "autumn") return "Autumn";
  return "General";
}

export default function ClientMessages() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);

  const [messageText, setMessageText] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedConversationId = selectedConversation?.id || null;

  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) =>
        timestampToMillis(b.lastMessageAt) - timestampToMillis(a.lastMessageAt)
    );
  }, [conversations]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);

      if (currentUser) {
        setAuthEmail(currentUser.email || "");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const conversationsQuery = query(
      collection(db, "conversations"),
      where("clientUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const nextConversations = snapshot.docs.map((conversationDoc) => ({
          id: conversationDoc.id,
          ...conversationDoc.data(),
        }));

        setConversations(nextConversations);
        setActionError("");

        if (!selectedConversationId && nextConversations.length > 0) {
          const newestConversation = [...nextConversations].sort(
            (a, b) =>
              timestampToMillis(b.lastMessageAt) -
              timestampToMillis(a.lastMessageAt)
          )[0];

          setSelectedConversation(newestConversation);
        }
      },
      (error) => {
        console.error(error);
        setActionError("Could not load your conversations.");
      }
    );

    return () => unsubscribe();
  }, [user, selectedConversationId]);

  useEffect(() => {
    if (!user || !selectedConversation) return;

    const messagesQuery = query(
      collection(db, "messages"),
      where("clientUid", "==", user.uid),
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
        setActionError("Could not load your messages.");
      }
    );

    return () => unsubscribe();
  }, [user, selectedConversation]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          authEmail,
          authPassword
        );

        if (authName.trim()) {
          await updateProfile(credential.user, {
            displayName: authName.trim(),
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error) {
      console.error(error);
      setAuthError(
        "Login failed. Check your email/password or create an account."
      );
    }
  }

  function handleSelectConversation(conversation) {
    setSelectedConversation(conversation);
    setMessages([]);
    setActionError("");
  }

  async function sendClientMessage(event) {
    event.preventDefault();

    if (!user || !selectedConversation || !messageText.trim()) return;

    setIsSending(true);
    setActionError("");

    try {
      const body = messageText.trim();

      await addDoc(collection(db, "messages"), {
        conversationId: selectedConversation.id,
        applicationId: selectedConversation.applicationId || null,
        clientUid: user.uid,

        senderUid: user.uid,
        senderRole: "client",
        senderName:
          user.displayName ||
          selectedConversation.clientName ||
          user.email ||
          "Client",

        body,

        createdAt: serverTimestamp(),
      });

      const conversationRef = doc(db, "conversations", selectedConversation.id);

      await updateDoc(conversationRef, {
        lastMessagePreview: body.slice(0, 140),
        lastMessageAt: serverTimestamp(),
        unreadForAdmin: true,
        unreadForClient: false,
        updatedAt: serverTimestamp(),
      });

      setMessageText("");
    } catch (error) {
      console.error(error);
      setActionError("Could not send your message. Please try again.");
    } finally {
      setIsSending(false);
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

          <h1>Client Messages</h1>

          <p>
            Log in to view your Tattoo Project Membership messages and reply to
            the studio.
          </p>

          <form className="portal-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <label>
                Full name
                <input
                  type="text"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>

            {authError && <p className="error-message">{authError}</p>}

            <button className="button button-primary" type="submit">
              {authMode === "signup" ? "Create Tattoo Portal Login" : "Log In"}
            </button>
          </form>

          <button
            className="text-button"
            type="button"
            onClick={() =>
              setAuthMode((current) =>
                current === "login" ? "signup" : "login"
              )
            }
          >
            {authMode === "login"
              ? "Need a login? Create one here."
              : "Already have a login? Log in instead."}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-page">
      <section className="portal-header">
        <div>
          <p className="eyebrow">Tattoo Portal</p>
          <h1>Messages</h1>
          <p>
            View your tattoo project messages and reply to Fawcett Tattoos &
            Art Studio.
          </p>
        </div>

        <div className="portal-header-actions">
          
          <Link className="button button-secondary" href="/portal/dashboard">
            Dashboard
          </Link>
          <Link className="button button-secondary" href="/tattoo-project-membership">
            Program Page
          </Link>
          <Link className="button button-secondary" href="/portal/appointments">
            Appointments
          </Link>
          <Link className="button button-secondary" href="/portal/project-timeline">
            Timeline
          </Link>
          <Link className="button button-secondary" href="/portal/credit">
            Credit
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

      <section className="portal-messages-layout">
        <aside className="portal-conversation-panel">
          <div className="panel-heading">
            <h2>Your Conversations</h2>
            <p>{sortedConversations.length}</p>
          </div>

          {sortedConversations.length === 0 ? (
            <div className="empty-small">
              <p>You do not have any conversations yet.</p>

              <Link className="button button-primary" href="/tattoo-project-membership#apply">
                Apply for the Waitlist
              </Link>
            </div>
          ) : (
            <div className="conversation-list">
              {sortedConversations.map((conversation) => (
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
                    {conversation.subject || "Tattoo Project Conversation"}
                  </strong>

                  <span>
                    Inbox: {getInboxLabel(conversation.assignedInbox)}
                  </span>

                  <p>
                    {conversation.lastMessagePreview ||
                      "No message preview available."}
                  </p>

                  <small>{formatDate(conversation.lastMessageAt)}</small>

                  {conversation.unreadForClient && (
                    <small className="unread-pill">New reply</small>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="portal-message-panel">
          {actionError && <p className="error-message">{actionError}</p>}

          {!selectedConversation ? (
            <div className="empty-state">
              <h2>Select a conversation</h2>
              <p>
                Choose a conversation to read messages from the studio.
              </p>
            </div>
          ) : (
            <>
              <div className="message-panel-header">
                <div>
                  <h2>{selectedConversation.subject}</h2>

                  <p>
                    Assigned inbox:{" "}
                    {getInboxLabel(selectedConversation.assignedInbox)}
                  </p>

                  <p>Status: {selectedConversation.status || "new"}</p>
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

              <form className="reply-form" onSubmit={sendClientMessage}>
                <label>
                  Reply to the studio
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    rows={4}
                    placeholder="Write your message..."
                    required
                  />
                </label>

                <button
                  className="button button-primary"
                  type="submit"
                  disabled={isSending}
                >
                  {isSending ? "Sending..." : "Send Message"}
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}