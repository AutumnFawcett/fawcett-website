const copy = {
  consult_studio: ["New tattoo consultation received", "A new consultation has been received. Sign in to the studio dashboard to review it."],
  application_studio: ["New membership application received", "A new Tattoo Project Membership application has been received. Sign in to the studio dashboard to review it."],
  consult_client: ["We received your tattoo consultation", "Thank you for contacting Fawcett Tattoos & Art Studio. Your consultation has been received. Visit your Tattoo Portal for updates."],
  application_client: ["We received your membership application", "Thank you for applying to the Tattoo Project Membership. Your application has been received. No payment has been collected. Visit your Tattoo Portal for updates."],
  message_client: ["You have a new Tattoo Portal message", "The studio has sent you a message. Sign in to your Tattoo Portal to read and reply. For your privacy, the conversation stays in the portal."],
};
const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function emailTemplate(kind, origin) {
  if (!copy[kind]) throw new Error("unknown_notification_kind");
  const [subject, paragraph] = copy[kind];
  // Generic sign-in links only: no token, record ID, email, or private preview.
  const url = new URL(kind.endsWith("_studio") ? "/admin" : "/tattoo-portal", origin).href;
  const label = kind.endsWith("_studio") ? "Open studio dashboard" : "Open Tattoo Portal";
  return { subject, text: `Fawcett Tattoos & Art Studio\n\n${paragraph}\n\n${label}: ${url}\n\nPlease reply inside the Tattoo Portal.`, html: `<div style="background:#000;color:#fff;padding:32px;font-family:Arial,sans-serif;max-width:600px"><h1 style="font-size:24px">Fawcett Tattoos &amp; Art Studio</h1><p>${paragraph}</p><p><a style="background:#1677ff;color:#fff;padding:12px 18px;display:inline-block;text-decoration:none" href="${escape(url)}">${label}</a></p><p style="color:#ccc;font-size:13px">Please reply inside the Tattoo Portal.</p></div>` };
}
