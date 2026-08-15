import ClientDashboard from "@/components/ClientDashboard";

export const metadata = {
  title: "Tattoo Portal Dashboard",
  description:
    "Tattoo Portal dashboard for Fawcett Tattoos & Art Studio clients to view messages, appointments, projects, credit, offers, and studio updates.",
};

export default function PortalDashboardPage() {
  return <ClientDashboard />;
}