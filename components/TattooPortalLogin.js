"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

export default function TattooPortalLogin() {
  const router = useRouter();

  const [mode, setMode] = useState("client_login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  async function checkAdminAccess(user) {
    const adminRef = doc(db, "adminUsers", user.uid);
    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists() && adminSnap.data().active === true;
  }

  async function handleClientLogin(event) {
    event.preventDefault();

    setIsWorking(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/portal/dashboard");
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
    setErrorMessage("");
    setStatusMessage("");

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const hasAdminAccess = await checkAdminAccess(credential.user);

      if (!hasAdminAccess) {
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
    setErrorMessage("");
    setStatusMessage("");

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

      router.push("/portal/dashboard");
    } catch (error) {
      console.error(error);

      if (error.code === "auth/email-already-in-use") {
        setErrorMessage(
          "This email already has an account. Try Tattoo Portal Login instead."
        );
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
    <main className="tattoo-portal-login-page">
      <section className="tattoo-portal-login-hero">
        <div>
          <p className="eyebrow">Fawcett Tattoos & Art Studio</p>
          <h1>Tattoo Portal</h1>

          <p>
            Log in to view messages, appointments, projects, tattoo credit,
            membership offers, and studio updates.
          </p>

          <div className="tattoo-portal-quick-links">
            <Link className="button button-secondary" href="/">
              Back to Website
            </Link>

            <Link className="button button-secondary" href="/consult">
              Start a Consult
            </Link>

            <Link
              className="button button-secondary"
              href="/tattoo-project-membership"
            >
              Tattoo Credit Waitlist
            </Link>
          </div>
        </div>

        <article className="tattoo-portal-login-card">
          <div className="tattoo-portal-tabs">
            <button
              type="button"
              className={
                mode === "client_login"
                  ? "tattoo-portal-tab tattoo-portal-tab-active"
                  : "tattoo-portal-tab"
              }
              onClick={() => {
                setMode("client_login");
                setErrorMessage("");
                setStatusMessage("");
              }}
            >
              Client Login
            </button>

            <button
              type="button"
              className={
                mode === "client_signup"
                  ? "tattoo-portal-tab tattoo-portal-tab-active"
                  : "tattoo-portal-tab"
              }
              onClick={() => {
                setMode("client_signup");
                setErrorMessage("");
                setStatusMessage("");
              }}
            >
              Sign Up
            </button>

            <button
              type="button"
              className={
                mode === "admin_login"
                  ? "tattoo-portal-tab tattoo-portal-tab-active"
                  : "tattoo-portal-tab"
              }
              onClick={() => {
                setMode("admin_login");
                setErrorMessage("");
                setStatusMessage("");
              }}
            >
              Admin
            </button>
          </div>

          <h2>{getFormTitle()}</h2>

          <form className="tattoo-portal-form" onSubmit={handleSubmit}>
            {mode === "client_signup" ? (
              <label>
                Full Name
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your full name"
                  required
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                required
              />
            </label>

            {errorMessage ? (
              <p className="error-message">{errorMessage}</p>
            ) : null}

            {statusMessage ? (
              <p className="success-message">{statusMessage}</p>
            ) : null}

            <button
              className="button button-primary"
              type="submit"
              disabled={isWorking}
            >
              {getSubmitText()}
            </button>
          </form>

          <div className="tattoo-portal-login-note">
            <strong>Note:</strong> Creating an account does not automatically
            approve a tattoo project, payment plan, or membership. The studio
            reviews all requests before confirming next steps.
          </div>
        </article>
      </section>
    </main>
  );
}