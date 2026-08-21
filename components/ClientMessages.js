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
  setDoc,
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

        await setDoc(doc(db, "clients", credential.user.uid), {
          clientUid: credential.user.uid,
          clientName: authName.trim(),
          clientEmail: credential.user.email || authEmail,
          phone: "",
          instagram: "",
          status: "portal_signup",
          source: "client_messages_signup",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error) {
      console.error(error);

      if (error.code === "auth/email-already-in-use") {
        setAuthError(
          "This email already has an account. Try logging in instead."
        );
      } else if (error.code === "auth/weak-password") {
        setAuthError("Password should be at least 6 characters.");
      } else {
        setAuthError(
          "Login failed. Check your email/password or create an account."
        );
      }
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
      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-white/45">
            Checking Tattoo Portal login...
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white">
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
            <Link href="/" className="text-sm text-white/60 hover:text-white">
              ← Back to Website
            </Link>

            <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
              Tattoo Portal
            </p>

            <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
              Client Messages
            </h1>

            <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
              Log in to view your Tattoo Project Membership messages and reply
              to the studio.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_0_45px_rgba(0,0,204,0.12)] md:p-8">
            <div className="grid grid-cols-2 gap-1 rounded-[1.25rem] border border-white/10 bg-black/45 p-1 sm:rounded-full">
              <button
                type="button"
                className={
                  authMode === "login"
                    ? "rounded-[1rem] bg-[#0000cc] px-4 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,0,204,0.35)] sm:rounded-full"
                    : "rounded-[1rem] px-4 py-3 text-sm font-black text-white/68 transition hover:bg-white/[0.06] hover:text-white sm:rounded-full"
                }
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                Log In
              </button>

              <button
                type="button"
                className={
                  authMode === "signup"
                    ? "rounded-[1rem] bg-[#0000cc] px-4 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,0,204,0.35)] sm:rounded-full"
                    : "rounded-[1rem] px-4 py-3 text-sm font-black text-white/68 transition hover:bg-white/[0.06] hover:text-white sm:rounded-full"
                }
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
              >
                Create Login
              </button>
            </div>

            <h2 className="mt-8 text-3xl font-black tracking-[-0.05em] text-white md:text-4xl">
              {authMode === "signup"
                ? "Create Tattoo Portal Login"
                : "Tattoo Portal Login"}
            </h2>

            <form className="mt-6 grid gap-5" onSubmit={handleAuthSubmit}>
              {authMode === "signup" ? (
                <label className="grid gap-2 text-sm font-black text-white/80">
                  Full name
                  <input
                    type="text"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    required
                    className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                  />
                </label>
              ) : null}

              <label className="grid gap-2 text-sm font-black text-white/80">
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  required
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-white/80">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  minLength={6}
                  required
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              {authError ? (
                <p className="rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
                  {authError}
                </p>
              ) : null}

              <button className="button button-primary w-full" type="submit">
                {authMode === "signup" ? "Create Tattoo Portal Login" : "Log In"}
              </button>
            </form>

            <div className="mt-6 rounded-[1.25rem] border border-[#0000cc]/35 bg-[#0000cc]/10 p-4 text-sm font-bold leading-7 text-white/70">
              <strong className="text-white">Note:</strong> Creating an account
              does not automatically approve a tattoo project, payment plan,
              membership, or appointment.
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Tattoo Portal
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
                Messages
              </h1>

              <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-white/70">
                View your tattoo project messages and reply to Fawcett Tattoos
                & Art Studio.
              </p>
            </div>

            <div className="grid gap-3 sm:flex sm:flex-wrap lg:justify-end">
              <Link
                className="button button-primary justify-center"
                href="/portal/dashboard"
              >
                Dashboard
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/appointments"
              >
                Appointments
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/project-timeline"
              >
                Timeline
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/credit"
              >
                Credit
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/portal/membership-offers"
              >
                Membership Offers
              </Link>

              <button
                className="button button-secondary justify-center"
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  router.push("/tattoo-portal");
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[0.45fr_1fr]">
        <aside className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Conversations
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                Your Conversations
              </h2>
            </div>

            <p className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-5 py-2.5 text-lg font-black tracking-[-0.04em] text-white shadow-[0_0_30px_rgba(0,0,204,0.3)]">
              {sortedConversations.length}
            </p>
          </div>

          {sortedConversations.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-black/35 p-5">
              <p className="text-base font-semibold leading-8 text-white/68">
                You do not have any conversations yet.
              </p>

              <Link
                className="button button-primary mt-5 w-full justify-center"
                href="/tattoo-project-membership#membership-application"
              >
                Apply for the Waitlist
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {sortedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={
                    selectedConversation?.id === conversation.id
                      ? "rounded-[1.25rem] border border-[#0000cc]/70 bg-[#0000cc]/20 p-4 text-left shadow-[0_0_28px_rgba(0,0,204,0.18)]"
                      : "rounded-[1.25rem] border border-white/10 bg-black/35 p-4 text-left transition hover:border-[#0000cc]/50 hover:bg-[#0000cc]/10"
                  }
                  onClick={() => handleSelectConversation(conversation)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <strong className="text-base font-black text-white">
                      {conversation.subject || "Tattoo Project Conversation"}
                    </strong>

                    {conversation.unreadForClient ? (
                      <span className="rounded-full border border-[#0000cc]/70 bg-[#0000cc]/25 px-3 py-1 text-xs font-black text-white">
                        New
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/42">
                    Inbox: {getInboxLabel(conversation.assignedInbox)}
                  </p>

                  <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-white/62">
                    {conversation.lastMessagePreview ||
                      "No message preview available."}
                  </p>

                  <small className="mt-3 block text-xs font-bold text-white/38">
                    {formatDate(conversation.lastMessageAt)}
                  </small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 md:p-7">
          {actionError ? (
            <p className="mb-5 rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
              {actionError}
            </p>
          ) : null}

          {!selectedConversation ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-black/35 p-5 md:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                Message Thread
              </p>

              <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">
                Select a conversation.
              </h2>

              <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-white/68">
                Choose a conversation to read messages from the studio.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                      Message Thread
                    </p>

                    <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white md:text-3xl">
                      {selectedConversation.subject ||
                        "Tattoo Project Conversation"}
                    </h2>

                    <p className="mt-3 text-sm font-bold leading-7 text-white/58">
                      Assigned inbox:{" "}
                      {getInboxLabel(selectedConversation.assignedInbox)}
                    </p>

                    <p className="text-sm font-bold leading-7 text-white/58">
                      Status: {selectedConversation.status || "new"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid max-h-[620px] gap-4 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                {messages.length === 0 ? (
                  <p className="text-base font-semibold leading-8 text-white/62">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        message.senderRole === "client"
                          ? "ml-auto max-w-[88%] rounded-[1.25rem] border border-[#0000cc]/60 bg-[#0000cc]/20 p-4 text-right shadow-[0_0_24px_rgba(0,0,204,0.16)]"
                          : "mr-auto max-w-[88%] rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-left"
                      }
                    >
                      <strong className="text-sm font-black text-white">
                        {message.senderName || message.senderRole}
                      </strong>

                      <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-white/72">
                        {message.body}
                      </p>

                      <small className="mt-3 block text-xs font-bold text-white/40">
                        {formatDate(message.createdAt)}
                      </small>
                    </article>
                  ))
                )}
              </div>

              <form className="mt-5 grid gap-4" onSubmit={sendClientMessage}>
                <label className="grid gap-2 text-sm font-black text-white/80">
                  Reply to the studio
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    rows={4}
                    placeholder="Write your message..."
                    required
                    className="min-h-32 rounded-[1rem] border border-white/10 bg-black/45 p-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                  />
                </label>

                <button
                  className="button button-primary w-full"
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