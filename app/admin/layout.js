import Link from "next/link";
export default function AdminLayout({ children }) {
  return <><aside className="bg-black text-white px-4 py-3 text-sm border-b border-blue-500">CRM changes require reviewed publication. Appointment changes withdraw previous portal details. <Link className="underline text-blue-300" href="/admin/publication">Review changes before publishing</Link>.</aside>{children}</>;
}
