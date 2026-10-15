export function notificationTransport(config, { fetcher = fetch } = {}) {
  if (config.mode === "test") return async (_envelope, id) => ({ id: `test_${id}` });
  if (config.mode !== "resend") throw new Error("delivery_disabled");
  return async (envelope, id) => {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `fawcett-${id}` },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) {
      const error = new Error("email_provider_unavailable");
      error.permanent = response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status);
      throw error;
    }
    return response.json();
  };
}
