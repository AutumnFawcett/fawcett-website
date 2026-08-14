"use client";

import { useEffect, useMemo, useState } from "react";
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
  phone: "",
  instagram: "",
  preferredContactMethod: "email",

  preferredArtist: "not_sure",
  projectType: "full_sleeve",
  tattooIdea: "",
  colourPreference: "not_sure",

  placement: "",
  bodySide: "not_sure",
  sizeCategory: "not_sure",
  detailLevel: "not_sure",

  isCoverUp: "no",
  coverUpDescription: "",

  tierInterest: "starter",
  monthlyComfort: "150",
  paymentStyle: "monthly",

  planningTimeline: "1_3_months",
  completionWindow: "yes",
  availability: "",

  readyForConsult: "yes",
  healthConsiderations: "no",
  healthDetails: "",

  acknowledgementApplicationOnly: false,
  acknowledgementNoPayment: false,
  acknowledgementNoGuarantee: false,
  acknowledgementNotInvestment: false,
  acknowledgementMandatoryCosts: false,
  acknowledgementTerms: false,
  acknowledgementStudioPolicy: false,
  acknowledgementAccurate: false,
  acknowledgementContact: false,
};

export default function MembershipApplicationForm() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("signup");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        setAuthEmail(currentUser.email || "");
        setForm((current) => ({
          ...current,
          fullName: current.fullName || currentUser.displayName || "",
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  const allAcknowledgementsChecked = useMemo(() => {
    return (
      form.acknowledgementApplicationOnly &&
      form.acknowledgementNoPayment &&
      form.acknowledgementNoGuarantee &&
      form.acknowledgementNotInvestment &&
      form.acknowledgementMandatoryCosts &&
      form.acknowledgementTerms &&
      form.acknowledgementStudioPolicy &&
      form.acknowledgementAccurate &&
      form.acknowledgementContact
    );
  }, [form]);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

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

        setForm((current) => ({
          ...current,
          fullName: authName.trim(),
        }));
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error) {
      console.error(error);
      setAuthError(
        "Login failed. Check your email/password or try creating an account."
      );
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user) {
      setSubmitError("Please create a tattoo portal login before submitting.");
      return;
    }

    if (!allAcknowledgementsChecked) {
      setSubmitError("Please check all required acknowledgements.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const applicationRef = await addDoc(
        collection(db, "membershipApplications"),
        {
          programName: "Tattoo Project Membership Program",
          applicationType: "founding_member_interest",

          clientUid: user.uid,
          clientEmail: user.email,
          clientName: form.fullName.trim(),
          phone: form.phone.trim(),
          instagram: form.instagram.trim(),
          preferredContactMethod: form.preferredContactMethod,

          status: "new",
          assignedInbox: "general",
          assignedArtistId: null,

          preferredArtist: form.preferredArtist,

          project: {
            projectType: form.projectType,
            tattooIdea: form.tattooIdea.trim(),
            colourPreference: form.colourPreference,
            placement: form.placement.trim(),
            bodySide: form.bodySide,
            sizeCategory: form.sizeCategory,
            detailLevel: form.detailLevel,
          },

          coverUp: {
            isCoverUp: form.isCoverUp,
            coverUpDescription: form.coverUpDescription.trim(),
          },

          budget: {
            tierInterest: form.tierInterest,
            monthlyComfort: form.monthlyComfort,
            paymentStyle: form.paymentStyle,
          },

          timeline: {
            planningTimeline: form.planningTimeline,
            completionWindow: form.completionWindow,
            availability: form.availability.trim(),
          },

          readiness: {
            readyForConsult: form.readyForConsult,
            healthConsiderations: form.healthConsiderations,
            healthDetails: form.healthDetails.trim(),
          },

          acknowledgements: {
            applicationOnly: form.acknowledgementApplicationOnly,
            noPaymentCollected: form.acknowledgementNoPayment,
            noGuarantee: form.acknowledgementNoGuarantee,
            notInvestmentLoanDiscount: form.acknowledgementNotInvestment,
            mandatoryCostsBeforeEnrollment:
              form.acknowledgementMandatoryCosts,
            termsBeforeEnrollment: form.acknowledgementTerms,
            studioPolicy: form.acknowledgementStudioPolicy,
            informationAccurate: form.acknowledgementAccurate,
            contactPermission: form.acknowledgementContact,
          },

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      const conversationRef = await addDoc(collection(db, "conversations"), {
        applicationId: applicationRef.id,
        clientUid: user.uid,
        clientEmail: user.email,
        clientName: form.fullName.trim(),

        assignedInbox: "general",
        assignedArtistId: null,

        status: "new",
        subject: "Tattoo Project Membership Application",
        lastMessagePreview: form.tattooIdea.trim().slice(0, 140),
        lastMessageAt: serverTimestamp(),

        unreadForAdmin: true,
        unreadForClient: false,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "messages"), {
        conversationId: conversationRef.id,
        applicationId: applicationRef.id,
        clientUid: user.uid,

        senderUid: user.uid,
        senderRole: "client",
        senderName: form.fullName.trim(),

        body: `Application submitted. Tattoo idea: ${form.tattooIdea.trim()}`,

        createdAt: serverTimestamp(),
      });

      router.push("/tattoo-project-membership/thank-you");
    } catch (error) {
      console.error(error);
      setSubmitError(
        error.message || "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="form-card">
        <h3>Create your tattoo portal login</h3>
        <p>
          Start by creating a login. This keeps your application, future
          messages, and tattoo portal connected to your account.
        </p>

        <form onSubmit={handleAuthSubmit} className="stacked-form">
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
              current === "signup" ? "login" : "signup"
            )
          }
        >
          {authMode === "signup"
            ? "Already have a login? Log in instead."
            : "Need a login? Create an account."}
        </button>
      </div>
    );
  }

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <div className="logged-in-row">
        <p>
          Logged in as <strong>{user.email}</strong>
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
      </div>

      <fieldset>
        <legend>1. Client Info</legend>

        <label>
          Full name *
          <input
            type="text"
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            required
          />
        </label>

        <label>
          Phone number *
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            required
          />
        </label>

        <label>
          Instagram handle
          <input
            type="text"
            value={form.instagram}
            onChange={(event) => updateField("instagram", event.target.value)}
            placeholder="@username"
          />
        </label>

        <label>
          Preferred contact method *
          <select
            value={form.preferredContactMethod}
            onChange={(event) =>
              updateField("preferredContactMethod", event.target.value)
            }
            required
          >
            <option value="email">Email</option>
            <option value="text">Text</option>
            <option value="phone">Phone</option>
            <option value="instagram">Instagram DM</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>2. Preferred Artist</legend>

        <label>
          Which artist are you interested in working with? *
          <select
            value={form.preferredArtist}
            onChange={(event) =>
              updateField("preferredArtist", event.target.value)
            }
            required
          >
            <option value="ben">Ben</option>
            <option value="autumn">Autumn</option>
            <option value="no_preference">No preference</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>3. Tattoo Project Idea</legend>

        <label>
          What type of tattoo project are you planning? *
          <select
            value={form.projectType}
            onChange={(event) => updateField("projectType", event.target.value)}
            required
          >
            <option value="full_sleeve">Full sleeve</option>
            <option value="half_sleeve">Half sleeve</option>
            <option value="leg_sleeve">Leg sleeve</option>
            <option value="large_leg_piece">Large leg piece</option>
            <option value="back_piece">Back piece</option>
            <option value="cover_up">Cover-up</option>
            <option value="multi_session">Multi-session custom tattoo</option>
            <option value="other">Other</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>

        <label>
          Describe your tattoo idea *
          <textarea
            value={form.tattooIdea}
            onChange={(event) => updateField("tattooIdea", event.target.value)}
            rows={6}
            required
          />
        </label>

        <label>
          Colour preference *
          <select
            value={form.colourPreference}
            onChange={(event) =>
              updateField("colourPreference", event.target.value)
            }
            required
          >
            <option value="black_and_grey">Black and grey</option>
            <option value="colour">Colour</option>
            <option value="black_grey_with_colour">
              Mostly black and grey with small colour accents
            </option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>4. Placement / Body Area</legend>

        <label>
          Placement / body area *
          <input
            type="text"
            value={form.placement}
            onChange={(event) => updateField("placement", event.target.value)}
            placeholder="Example: left forearm, full arm, thigh, back"
            required
          />
        </label>

        <label>
          Which side of the body?
          <select
            value={form.bodySide}
            onChange={(event) => updateField("bodySide", event.target.value)}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="both">Both</option>
            <option value="centre">Centre</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>5. Size / Detail Level</legend>

        <label>
          Approximate size *
          <select
            value={form.sizeCategory}
            onChange={(event) => updateField("sizeCategory", event.target.value)}
            required
          >
            <option value="palm_sized">Palm-sized</option>
            <option value="hand_sized">Hand-sized</option>
            <option value="forearm_sized">Forearm-sized</option>
            <option value="half_sleeve">Half sleeve</option>
            <option value="full_sleeve">Full sleeve</option>
            <option value="large_leg_piece">Large leg piece</option>
            <option value="full_leg">Full leg</option>
            <option value="full_back">Full back</option>
            <option value="multi_area">Multi-area project</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>

        <label>
          Detail level *
          <select
            value={form.detailLevel}
            onChange={(event) => updateField("detailLevel", event.target.value)}
            required
          >
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="high_detail">Highly detailed</option>
            <option value="realism">Realism / high-detail custom work</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>6. Existing Tattoos / Cover-Up Info</legend>

        <label>
          Is this a cover-up? *
          <select
            value={form.isCoverUp}
            onChange={(event) => updateField("isCoverUp", event.target.value)}
            required
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="maybe">Maybe</option>
            <option value="partially">Partially</option>
          </select>
        </label>

        <label>
          If this is a cover-up, describe what needs to be covered
          <textarea
            value={form.coverUpDescription}
            onChange={(event) =>
              updateField("coverUpDescription", event.target.value)
            }
            rows={4}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>7. Budget Tier Interest</legend>

        <label>
          Which tier are you most interested in? *
          <select
            value={form.tierInterest}
            onChange={(event) => updateField("tierInterest", event.target.value)}
            required
          >
            <option value="starter">
              Starter Member — $500 initial + $150/month
            </option>
            <option value="builder">
              Builder Member — $750 initial + $300/month
            </option>
            <option value="commitment">
              Commitment Member — $1,000 initial + $500/month
            </option>
            <option value="custom">Custom project review</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>8. Monthly Payment Comfort Level</legend>

        <label>
          What monthly amount feels realistic for you? *
          <select
            value={form.monthlyComfort}
            onChange={(event) =>
              updateField("monthlyComfort", event.target.value)
            }
            required
          >
            <option value="under_150">Under $150/month</option>
            <option value="150">$150/month</option>
            <option value="300">$300/month</option>
            <option value="500">$500/month</option>
            <option value="500_plus">$500+/month</option>
            <option value="lump_sum">I prefer lump-sum payments</option>
            <option value="not_sure">I am not sure yet</option>
          </select>
        </label>

        <label>
          Which payment style would you prefer if accepted? *
          <select
            value={form.paymentStyle}
            onChange={(event) => updateField("paymentStyle", event.target.value)}
            required
          >
            <option value="monthly">Monthly payments</option>
            <option value="pay_per_session">Pay-per-session</option>
            <option value="larger_deposit">
              Larger deposit plus smaller monthly payments
            </option>
            <option value="build_before_booking">
              Build tattoo credit before booking
            </option>
            <option value="build_between_sessions">
              Build tattoo credit between sessions
            </option>
            <option value="custom">Custom payment schedule</option>
            <option value="not_sure">Not sure yet</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>9. Timeline</legend>

        <label>
          When would you like to start planning? *
          <select
            value={form.planningTimeline}
            onChange={(event) =>
              updateField("planningTimeline", event.target.value)
            }
            required
          >
            <option value="immediately">Immediately</option>
            <option value="1_3_months">1–3 months</option>
            <option value="3_6_months">3–6 months</option>
            <option value="6_12_months">6–12 months</option>
            <option value="planning_ahead">I am planning ahead</option>
          </select>
        </label>

        <label>
          Are you hoping to complete this project within 18–24 months? *
          <select
            value={form.completionWindow}
            onChange={(event) =>
              updateField("completionWindow", event.target.value)
            }
            required
          >
            <option value="yes">Yes</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
            <option value="artist_estimate">
              I need the artist to estimate the timeline
            </option>
          </select>
        </label>

        <label>
          General availability *
          <textarea
            value={form.availability}
            onChange={(event) => updateField("availability", event.target.value)}
            rows={3}
            placeholder="Example: weekdays, Saturdays, evenings, childcare schedule, travel limits"
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>10. Health / Readiness Questions</legend>

        <label>
          Are you ready to be contacted for a consultation or project review? *
          <select
            value={form.readyForConsult}
            onChange={(event) =>
              updateField("readyForConsult", event.target.value)
            }
            required
          >
            <option value="yes">Yes</option>
            <option value="not_yet">Not yet</option>
            <option value="questions_first">I have questions first</option>
          </select>
        </label>

        <label>
          Do you have skin, scar, medical, allergy, medication, healing,
          pregnancy, nursing, immune system, or health considerations that may
          affect tattooing? *
          <select
            value={form.healthConsiderations}
            onChange={(event) =>
              updateField("healthConsiderations", event.target.value)
            }
            required
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not_sure">Not sure</option>
            <option value="discuss_privately">
              I prefer to discuss privately
            </option>
          </select>
        </label>

        <label>
          Briefly explain only what you are comfortable sharing
          <textarea
            value={form.healthDetails}
            onChange={(event) =>
              updateField("healthDetails", event.target.value)
            }
            rows={4}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>11. Consent / Acknowledgements</legend>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementApplicationOnly}
            onChange={(event) =>
              updateField("acknowledgementApplicationOnly", event.target.checked)
            }
            required
          />
          I understand this is a waitlist/application only and does not enroll
          me in the Tattoo Project Membership Program.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementNoPayment}
            onChange={(event) =>
              updateField("acknowledgementNoPayment", event.target.checked)
            }
            required
          />
          I understand no payment is collected through this form.
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
          I understand submitting this application does not guarantee acceptance,
          enrollment, booking access, project approval, final pricing, priority
          placement, or a specific artist.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementNotInvestment}
            onChange={(event) =>
              updateField("acknowledgementNotInvestment", event.target.checked)
            }
            required
          />
          I understand this is not a discount, loan, investment, fundraiser,
          donation, ownership opportunity, or cash-return program.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementMandatoryCosts}
            onChange={(event) =>
              updateField("acknowledgementMandatoryCosts", event.target.checked)
            }
            required
          />
          I understand all mandatory costs will be disclosed in writing before
          enrollment, including tattoo time, supplies, GST, deposits, booking
          fees, drawing/design fees, payment-processing fees, and any other
          required costs.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementTerms}
            onChange={(event) =>
              updateField("acknowledgementTerms", event.target.checked)
            }
            required
          />
          I understand that before enrollment, I will need to review the full
          terms, payment schedule, cancellation policy, refund/credit policy,
          project estimate, and mandatory cost breakdown.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementStudioPolicy}
            onChange={(event) =>
              updateField("acknowledgementStudioPolicy", event.target.checked)
            }
            required
          />
          I understand all tattoo projects are subject to artist availability,
          project readiness, consultation approval, health requirements, deposit
          requirements, design requirements, scheduling availability, and written
          studio policies.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementAccurate}
            onChange={(event) =>
              updateField("acknowledgementAccurate", event.target.checked)
            }
            required
          />
          I confirm that the information I provided is accurate to the best of
          my knowledge.
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.acknowledgementContact}
            onChange={(event) =>
              updateField("acknowledgementContact", event.target.checked)
            }
            required
          />
          I give Fawcett Tattoos & Art Studio permission to contact me about my
          application, tattoo project, consultation options, and related next
          steps.
        </label>
      </fieldset>

      {submitError && <p className="error-message">{submitError}</p>}

      <button
        className="button button-primary"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Submitting..." : "Submit My Application"}
      </button>
    </form>
  );
}