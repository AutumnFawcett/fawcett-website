export const metadata = {
  title: "Fawcett Tattoos & Art Studio",
  description:
    "Custom tattoo studio in Edmonton, Alberta. Book consultations, view artist work, and start your next piece.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}