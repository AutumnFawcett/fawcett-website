import { notFound } from "next/navigation";
import StudioCalendarDemo from "@/components/StudioCalendarDemo";

export const metadata = {
  title: "Studio Calendar Preview | Fawcett Tattoos",
  robots: { index: false, follow: false },
};

// This synthetic design demo is available only on Vercel Preview deployments.
// The real admin schedule remains protected by Firebase admin authentication.
export default function StudioCalendarPreviewPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <StudioCalendarDemo />;
}
