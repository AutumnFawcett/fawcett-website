import VerifyPortalEmail from "@/components/VerifyPortalEmail";
export const dynamic = "force-dynamic";
export const metadata = { title: "Verify Your Email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function VerifyEmailPage() { return <VerifyPortalEmail />; }
