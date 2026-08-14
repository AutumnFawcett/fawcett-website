"use client";

import { useEffect, useState } from "react";
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
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  instagram: "",
  preferredContactMethod: "email",
  preferredArtist: "not_sure",

  projectType: "custom_tattoo",
  tattooIdea: "",
  placement: "",
  bodySide: "not_sure",
  approximateSize: "",
  colourPreference: "not_sure",
  styleDirection: "",
  budgetRange: "",
  availability: "",

  isCoverUp: "no",
  coverUpDescription: "",

  timeline: "flexible",
  isUrgent: "no",

  healthNotes: "",
  referenceLinks: "",

  acknowledgementAccurate: false,
  acknowledgementNoGuarantee: false,
  acknowledgementPolicy: false,
};

function formatValue(value) {
  if (!value) return "Not provided";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildConsultSummary(form) {
  return `
New tattoo consult request

Client:
Name: ${form.fullName}
Email: ${form.email}
Phone: ${form.phone}
Instagram: ${form.instagram || "Not provided"}
Preferred contact: ${formatValue(form.preferredContactMethod)}

Artist:
Preferred artist: ${formatValue(form.preferredArtist)}

Tattoo Request:
Project type: ${formatValue(form.projectType)}
Placement: ${form.placement}
Body side: ${formatValue(form.bodySide)}
Approximate size: ${form.approximateSize}
Colour preference: ${formatValue(form.colourPreference)}
Style direction: ${form.styleDirection || "Not provided"}
Budget range: ${form.budgetRange || "Not provided"}

Idea:
${form.tattooIdea}

Cover-up:
Is cover-up: ${formatValue(form.isCoverUp)}
Cover-up details: ${form.coverUpDescription || "Not provided"}

Timeline:
Timeline: ${formatValue(form.timeline)}
Urgent: ${formatValue(form.isUrgent)}
Availability: ${form.availability || "Not provided"}

Health / Notes:
${form.healthNotes || "Not provided"}

Reference links:
${form.referenceLinks || "Not provided"}
`.trim();
}

export default function ConsultRequestForm() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("signup");

  const [authPassword, setAuthPassword] = useState("");
  const [form, setForm] = useState(initialForm);

  const [authError, setAuthError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);

      if (currentUser) {
        setForm((current) => ({
          ...current,
          email: current.email || currentUser.email || "",
          fullName: current.fullName || currentUser.displayName || "",
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  function updateField(fieldName, value) {
    setForm((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          form.email,
          authPassword
        );

        if (form.fullName.trim()) {
          await updateProfile(credential.user, {
            displayName: form.fullName.trim(),
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, form.email, authPassword);
      }
    } catch (error) {
      console.error(error);
      setAuthError(
        "Login/signup failed. Check your email and password, or try logging in instead."
      );
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user) {
      setSubmitError("Please create a tattoo portal login or log in first.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const assignedInbox =
        form.preferredArtist === "ben"
          ? "ben"
          : form.preferredArtist === "autumn"
            ? "autumn"
            : "general";

      const assignedArtistId =
        assignedInbox === "ben"
          ? "artist_ben"
          : assignedInbox === "autumn"
            ? "artist_autumn"
            : null;

      const consultRef = await addDoc(collection(db, "consultRequests"), {
        clientUid: user.uid,
        clientName: form.fullName.trim(),
        clientEmail: form.email.trim(),
        phone: form.phone.trim(),
        instagram: form.instagram.trim(),
        preferredContactMethod: form.preferredContactMethod,

        preferredArtist: form.preferredArtist,
        assignedInbox,
        assignedArtistId,

        status: "new",

        request: {
          projectType: form.projectType,
          tattooIdea: form.tattooIdea.trim(),
          placement: form.placement.trim(),
          bodySide: form.bodySide,
          approximateSize: form.approximateSize.trim(),
          colourPreference: form.colourPreference,
          styleDirection: form.styleDirection.trim(),
          budgetRange: form.budgetRange.trim(),
          availability: form.availability.trim(),
          referenceLinks: form.referenceLinks.trim(),
        },

        coverUp: {
          isCoverUp: form.isCoverUp,
          coverUpDescription: form.coverUpDescription.trim(),
        },

        timeline: {
          timeline: form.timeline,
          isUrgent: form.isUrgent,
        },

        readiness: {
          healthNotes: form.healthNotes.trim(),
        },

        acknowledgements: {
          acknowledgementAccurate: form.acknowledgementAccurate,
          acknowledgementNoGuarantee: form.acknowledgementNoGuarantee,
          acknowledgementPolicy: form.acknowledgementPolicy,
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const summary = buildConsultSummary(form);

      const conversationRef = await addDoc(collection(db, "conversations"), {
        clientUid: user.uid,
        clientName: form.fullName.trim(),
        clientEmail: form.email.trim(),

        sourceType: "consultRequest",
        sourceId: consultRef.id,
        consultRequestId: consultRef.id,
        applicationId: null,

        assignedInbox,
        assignedArtistId,

        status: "new",
        subject: `Tattoo Consult - ${form.fullName.trim()}`,

        lastMessagePreview: summary.slice(0, 140),
        lastMessageAt: serverTimestamp(),

        unreadForAdmin: true,
        unreadForClient: false,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "messages"), {
        conversationId: conversationRef.id,
        applicationId: null,
        consultRequestId: consultRef.id,
        sourceType: "consultRequest",

        clientUid: user.uid,

        senderUid: user.uid,
        senderRole: "client",
        senderName: form.fullName.trim() || user.email || "Client",

        body: summary,

        createdAt: serverTimestamp(),
      });

      router.push("/portal/messages");
    } catch (error) {
      console.error(error);
      setSubmitError("Could not submit consult request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!authChecked) {
    return (
      <section className="consult-form-section">
        <p>Checking login...</p>
      </section>
    );
  }

  return (
    <section className="consult-form-section">
      {!user ? (
        <div className="consult-card">
          <p className="eyebrow">Tattoo Portal Login</p>

          <h2>Create or access your tattoo portal</h2>

          <p>
            Your consult request will be connected to a tattoo portal login so you can
            message the studio and track your request later.
          </p>

          <form className="application-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <label>
                Full Name
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    updateField("fullName", event.target.value)
                  }
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
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
                current === "signup" ? "login" : "signup"
              )
            }
          >
            {authMode === "signup"
              ? "Already have a login? Log in instead."
              : "Need a login? Create one here."}
          </button>
        </div>
      ) : (
        <div className="consult-card">
          <div className="consult-form-header">
            <div>
              <p className="eyebrow">Consult Request</p>
              <h2>Tell us about your tattoo idea</h2>
              <p>
                Logged in as <strong>{user.email}</strong>
              </p>
            </div>

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

          <form className="application-form" onSubmit={handleSubmit}>
            <fieldset>
              <legend>Client Info</legend>

              <label>
                Full Name
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    updateField("fullName", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  required
                />
              </label>

              <label>
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  required
                />
              </label>

              <label>
                Instagram
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(event) =>
                    updateField("instagram", event.target.value)
                  }
                  placeholder="@username"
                />
              </label>

              <label>
                Preferred Contact Method
                <select
                  value={form.preferredContactMethod}
                  onChange={(event) =>
                    updateField("preferredContactMethod", event.target.value)
                  }
                >
                  <option value="email">Email</option>
                  <option value="text">Text</option>
                  <option value="phone">Phone</option>
                  <option value="instagram_dm">Instagram DM</option>
                </select>
              </label>
            </fieldset>

            <fieldset>
              <legend>Tattoo Details</legend>

              <label>
                Preferred Artist
                <select
                  value={form.preferredArtist}
                  onChange={(event) =>
                    updateField("preferredArtist", event.target.value)
                  }
                >
                  <option value="not_sure">Not sure yet</option>
                  <option value="ben">Ben</option>
                  <option value="autumn">Autumn</option>
                  <option value="no_preference">No preference</option>
                </select>
              </label>

              <label>
                Project Type
                <select
                  value={form.projectType}
                  onChange={(event) =>
                    updateField("projectType", event.target.value)
                  }
                >
                  <option value="custom_tattoo">Custom Tattoo</option>
                  <option value="small_tattoo">Small Tattoo</option>
                  <option value="medium_tattoo">Medium Tattoo</option>
                  <option value="large_tattoo">Large Tattoo</option>
                  <option value="sleeve">Sleeve</option>
                  <option value="cover_up">Cover-Up</option>
                  <option value="touch_up">Touch-Up</option>
                  <option value="not_sure">Not Sure Yet</option>
                </select>
              </label>

              <label>
                Tattoo Idea
                <textarea
                  value={form.tattooIdea}
                  onChange={(event) =>
                    updateField("tattooIdea", event.target.value)
                  }
                  rows={6}
                  required
                />
              </label>

              <label>
                Placement
                <input
                  type="text"
                  value={form.placement}
                  onChange={(event) =>
                    updateField("placement", event.target.value)
                  }
                  placeholder="Example: left forearm, upper arm, thigh..."
                  required
                />
              </label>

              <label>
                Body Side
                <select
                  value={form.bodySide}
                  onChange={(event) => updateField("bodySide", event.target.value)}
                >
                  <option value="not_sure">Not sure</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="center">Center</option>
                  <option value="both">Both</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>

              <label>
                Approximate Size
                <input
                  type="text"
                  value={form.approximateSize}
                  onChange={(event) =>
                    updateField("approximateSize", event.target.value)
                  }
                  placeholder="Example: 4 inches, half sleeve, palm size..."
                  required
                />
              </label>

              <label>
                Black & Grey or Colour
                <select
                  value={form.colourPreference}
                  onChange={(event) =>
                    updateField("colourPreference", event.target.value)
                  }
                >
                  <option value="not_sure">Not sure</option>
                  <option value="black_and_grey">Black & Grey</option>
                  <option value="colour">Colour</option>
                  <option value="mix">Mix</option>
                </select>
              </label>

              <label>
                Style Direction
                <input
                  type="text"
                  value={form.styleDirection}
                  onChange={(event) =>
                    updateField("styleDirection", event.target.value)
                  }
                  placeholder="Realism, fine line, illustrative, floral, etc."
                />
              </label>

              <label>
                Reference Links
                <textarea
                  value={form.referenceLinks}
                  onChange={(event) =>
                    updateField("referenceLinks", event.target.value)
                  }
                  rows={4}
                  placeholder="Paste links for now. Image uploads can come later."
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Budget, Timeline & Readiness</legend>

              <label>
                Budget Range
                <input
                  type="text"
                  value={form.budgetRange}
                  onChange={(event) =>
                    updateField("budgetRange", event.target.value)
                  }
                  placeholder="Example: $300-$500, $1,000+, not sure..."
                />
              </label>

              <label>
                Timeline
                <select
                  value={form.timeline}
                  onChange={(event) => updateField("timeline", event.target.value)}
                >
                  <option value="flexible">Flexible</option>
                  <option value="asap">As soon as possible</option>
                  <option value="within_1_month">Within 1 month</option>
                  <option value="1_to_3_months">1–3 months</option>
                  <option value="3_to_6_months">3–6 months</option>
                  <option value="planning_ahead">Planning ahead</option>
                </select>
              </label>

              <label>
                Is this urgent?
                <select
                  value={form.isUrgent}
                  onChange={(event) => updateField("isUrgent", event.target.value)}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>

              <label>
                General Availability
                <textarea
                  value={form.availability}
                  onChange={(event) =>
                    updateField("availability", event.target.value)
                  }
                  rows={4}
                  placeholder="Weekdays, weekends, evenings, specific dates..."
                />
              </label>

              <label>
                Is this a cover-up?
                <select
                  value={form.isCoverUp}
                  onChange={(event) => updateField("isCoverUp", event.target.value)}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                </select>
              </label>

              {form.isCoverUp !== "no" && (
                <label>
                  Cover-Up Details
                  <textarea
                    value={form.coverUpDescription}
                    onChange={(event) =>
                      updateField("coverUpDescription", event.target.value)
                    }
                    rows={4}
                  />
                </label>
              )}

              <label>
                Health / Skin / Readiness Notes
                <textarea
                  value={form.healthNotes}
                  onChange={(event) =>
                    updateField("healthNotes", event.target.value)
                  }
                  rows={4}
                  placeholder="Optional. You can also discuss private details during consult."
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Acknowledgements</legend>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.acknowledgementAccurate}
                  onChange={(event) =>
                    updateField("acknowledgementAccurate", event.target.checked)
                  }
                  required
                />
                I confirm the information I provided is accurate.
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.acknowledgementNoGuarantee}
                  onChange={(event) =>
                    updateField("acknowledgementNoGuarantee", event.target.checked)
                  }
                  required
                />
                I understand submitting a request does not guarantee approval,
                pricing, artist availability, or an appointment.
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.acknowledgementPolicy}
                  onChange={(event) =>
                    updateField("acknowledgementPolicy", event.target.checked)
                  }
                  required
                />
                I understand approved bookings are subject to studio policies,
                deposits/booking fees, health requirements, and artist review.
              </label>
            </fieldset>

            {submitError && <p className="error-message">{submitError}</p>}

            <button
              className="button button-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Consult Request"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}