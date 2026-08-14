import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://www.fawcetttattoos.com"),
  title: {
    default: "Fawcett Tattoos & Art Studio | Edmonton Tattoo Studio",
    template: "%s | Fawcett Tattoos & Art Studio",
  },
  description:
    "Fawcett Tattoos & Art Studio is a private Edmonton tattoo and art studio creating custom black and grey, color, realism-driven, and large-scale tattoo work.",
  keywords: [
    "Fawcett Tattoos",
    "Fawcett Tattoos Edmonton",
    "Edmonton tattoo studio",
    "Edmonton tattoo artist",
    "custom tattoos Edmonton",
    "black and grey tattoos Edmonton",
    "color tattoos Edmonton",
    "tattoo consult Edmonton",
    "Tattoo Portal",
  ],
  authors: [{ name: "Fawcett Tattoos & Art Studio" }],
  creator: "Fawcett Tattoos & Art Studio",
  publisher: "Fawcett Tattoos & Art Studio",
  openGraph: {
    title: "Fawcett Tattoos & Art Studio | Edmonton Tattoo Studio",
    description:
      "Private Edmonton tattoo and art studio creating custom black and grey, color, realism-driven, and large-scale tattoo work.",
    url: "https://www.fawcetttattoos.com",
    siteName: "Fawcett Tattoos & Art Studio",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fawcett Tattoos & Art Studio | Edmonton Tattoo Studio",
    description:
      "Private Edmonton tattoo and art studio creating custom black and grey, color, realism-driven, and large-scale tattoo work.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}