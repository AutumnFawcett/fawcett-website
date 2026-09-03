"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

export default function TattooPortalLogin() {
  const router = useRouter();
  const safeDestination = () => new URLSearchParams(window.location.search).get("returnTo") === "/founders" ? "/founders" : "/portal/dashboard";

  const [mode, setMode] = useState("client_login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  function clearMessages() {
    setStatusMessage("");
    setErrorMessage("");
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    clearMessages();
  }

  async function checkAdminAccess(user) {
    const adminRef = doc(db, "adminUsers", user.uid);
    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists() && adminSnap.data().active === true;
  }

  async function handleClientLogin(event) {
    event.preventDefault();

    setIsWorking(true);
    clearMessages();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push(safeDestination());
    } catch (error) {
      console.error(error);
      setErrorMessage("Tattoo portal login failed. Check your email and password.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();

    setIsWorking(true);
    clearMessages();

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const hasAdminAccess = await checkAdminAccess(credential.user);

      if (!hasAdminAccess) {
        await signOut(auth);
        setErrorMessage(
          "This account is not listed as an active admin in Firestore."
        );
        return;
      }

      router.push("/admin/dashboard");
    } catch (error) {
      console.error(error);
      setErrorMessage("Admin login failed. Check your email and password.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleClientSignup(event) {
    event.preventDefault();

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    setIsWorking(true);
    clearMessages();

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(credential.user, {
        displayName: fullName.trim(),
      });

      await setDoc(doc(db, "clients", credential.user.uid), {
        clientUid: credential.user.uid,
        clientName: fullName.trim(),
        clientEmail: credential.user.email || email,
        phone: "",
        instagram: "",
        status: "portal_signup",
        source: "tattoo_portal_signup",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push(safeDestination());
    } catch (error) {
      console.error(error);

      if (error.code === "auth/email-already-in-use") {
        setErrorMessage(
          "This email already has an account. Try Tattoo Portal Login instead."
        );
      } else if (error.code === "auth/weak-password") {
        setErrorMessage("Password should be at least 6 characters.");
      } else {
        setErrorMessage("Could not create account. Please try again.");
      }
    } finally {
      setIsWorking(false);
    }
  }

  function getFormTitle() {
    if (mode === "admin_login") return "Admin Login";
    if (mode === "client_signup") return "Create Tattoo Portal Account";
    return "Tattoo Portal Login";
  }

  function getSubmitText() {
    if (isWorking) return "Working...";
    if (mode === "admin_login") return "Log In as Admin";
    if (mode === "client_signup") return "Create Account";
    return "Log In";
  }

  function handleSubmit(event) {
    if (mode === "admin_login") {
      handleAdminLogin(event);
      return;
    }

    if (mode === "client_signup") {
      handleClientSignup(event);
      return;
    }

    handleClientLogin(event);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:px-8 md:py-16 lg:grid-cols-[0.95fr_0.75fr] lg:items-center">
          <div>
            <Link href="/" className="text-sm text-white/60 hover:text-white">
              ← Back to Website
            </Link>

            <p className="mt-8 text-xs uppercase tracking-[0.32em] text-white/45">
              Fawcett Tattoos & Art Studio
            </p>

            <h1 className="mt-4 max-w-5xl text-5xl font-black leading-[0.9] tracking-[-0.07em] text-white sm:text-6xl md:text-8xl">
              Tattoo Portal
            </h1>

            <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/70 md:text-lg">
              Log in to view messages, appointments, projects, tattoo credit,
              membership offers, and studio updates.
            </p>

            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link className="button button-secondary justify-center" href="/">
                Back to Website
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/consult"
              >
                Start a Consult
              </Link>

              <Link
                className="button button-secondary justify-center"
                href="/tattoo-project-membership"
              >
                Tattoo Credit Waitlist
              </Link>
            </div>
          </div>

          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-4 shadow-[0_0_45px_rgba(0,0,204,0.12)] sm:p-5 md:rounded-[2rem] md:p-7">
            <div className="grid grid-cols-3 gap-1 rounded-[1.25rem] border border-white/10 bg-black/45 p-1 sm:rounded-full">
              <button
                type="button"
                className={
                  mode === "client_login"
                    ? "rounded-[1rem] bg-[#0000cc] px-2 py-3 text-xs font-black text-white shadow-[0_0_30px_rgba(0,0,204,0.35)] sm:rounded-full sm:text-sm"
                    : "rounded-[1rem] px-2 py-3 text-xs font-black text-white/68 transition hover:bg-white/[0.06] hover:text-white sm:rounded-full sm:text-sm"
                }
                onClick={() => changeMode("client_login")}
              >
                Client Login
              </button>

              <button
                type="button"
                className={
                  mode === "client_signup"
                    ? "rounded-[1rem] bg-[#0000cc] px-2 py-3 text-xs font-black text-white shadow-[0_0_30px_rgba(0,0,204,0.35)] sm:rounded-full sm:text-sm"
                    : "rounded-[1rem] px-2 py-3 text-xs font-black text-white/68 transition hover:bg-white/[0.06] hover:text-white sm:rounded-full sm:text-sm"
                }
                onClick={() => changeMode("client_signup")}
              >
                Sign Up
              </button>

              <button
                type="button"
                className={
                  mode === "admin_login"
                    ? "rounded-[1rem] bg-[#0000cc] px-2 py-3 text-xs font-black text-white shadow-[0_0_30px_rgba(0,0,204,0.35)] sm:rounded-full sm:text-sm"
                    : "rounded-[1rem] px-2 py-3 text-xs font-black text-white/68 transition hover:bg-white/[0.06] hover:text-white sm:rounded-full sm:text-sm"
                }
                onClick={() => changeMode("admin_login")}
              >
                Admin Login
              </button>
            </div>

            <h2 className="mt-7 text-3xl font-black tracking-[-0.05em] text-white md:text-4xl">
              {getFormTitle()}
            </h2>

            <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
              {mode === "client_signup" ? (
                <label className="grid gap-2 text-sm font-black text-white/80">
                  Full Name
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your full name"
                    required
                    className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                  />
                </label>
              ) : null}

              <label className="grid gap-2 text-sm font-black text-white/80">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@email.com"
                  required
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-white/80">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                  className="min-h-14 rounded-[1rem] border border-white/10 bg-black/45 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-[#0000cc]"
                />
              </label>

              {errorMessage ? (
                <p className="rounded-[1rem] border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold leading-7 text-red-100">
                  {errorMessage}
                </p>
              ) : null}

              {statusMessage ? (
                <p className="rounded-[1rem] border border-green-400/30 bg-green-500/10 p-4 text-sm font-bold leading-7 text-green-100">
                  {statusMessage}
                </p>
              ) : null}

              <button
                className="button button-primary w-full"
                type="submit"
                disabled={isWorking}
              >
                {getSubmitText()}
              </button>
            </form>

            <div className="mt-6 rounded-[1.25rem] border border-[#0000cc]/35 bg-[#0000cc]/10 p-4 text-sm font-bold leading-7 text-white/70">
              <strong className="text-white">Note:</strong> Creating an account
              does not automatically approve a tattoo project, payment plan, or
              membership. The studio reviews all requests before confirming next
              steps.
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
