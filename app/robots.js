export default function robots() {
  const baseUrl = "https://www.fawcetttattoos.com";

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/pricing",
        "/policies",
        "/aftercare",
        "/consult",
        "/tattoo-project-membership",
        "/tattoo-portal",
      ],
      disallow: [
        "/admin",
        "/admin/",
        "/portal",
        "/portal/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}