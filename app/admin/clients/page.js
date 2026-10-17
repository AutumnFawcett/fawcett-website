import AdminClients from "@/components/AdminClients";

export const metadata = {
  title: "Admin Clients | Fawcett Tattoos & Art Studio",
};

export default async function AdminClientsPage({ searchParams }) {
  const params = await searchParams;
  const initialClientUid = typeof params?.uid === "string" ? params.uid : "";
  return <AdminClients initialClientUid={initialClientUid} />;
}