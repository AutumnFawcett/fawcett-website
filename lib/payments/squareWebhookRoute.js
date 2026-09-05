const SENSITIVE_ENV_NAME = /(token|secret|password|credential|private.?key|signature.?key)/i;
const SENSITIVE_TEXT = /(bearer\s+\S+|-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----|(?:access[_ -]?token|private[_ -]?key|signature[_ -]?key|password|secret)\s*[:=]\s*\S+)/gi;

function safeDiagnostic(value) {
  let text = typeof value === "string" ? value : value == null ? "" : String(value);
  for (const [name, secret] of Object.entries(process.env)) {
    if (SENSITIVE_ENV_NAME.test(name) && typeof secret === "string" && secret.length >= 4) text = text.split(secret).join("[redacted]");
  }
  return text.replace(SENSITIVE_TEXT, "[redacted]");
}

function logFailure(stage, error, logger) {
  logger.error({
    stage,
    name: safeDiagnostic(error?.name),
    code: safeDiagnostic(error?.code),
    message: safeDiagnostic(error?.message),
  });
}

const response = (outcome, status, reason) => Response.json({ outcome, ...(reason && { reason }) }, { status });

export async function handleSquareWebhookRequest(request, dependencies) {
  let config;
  try {
    config = dependencies.getConfig();
  } catch (error) {
    logFailure("configuration", error, dependencies.logger);
    return response("retryable", 503, "server_configuration_unavailable");
  }

  try {
    const { firestore } = dependencies.getFirebaseAdmin();
    const result = await dependencies.handleWebhook({ request, config, firestore, now: dependencies.now });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    logFailure("processing", error, dependencies.logger);
    return response("retryable", 503, "processing_unavailable");
  }
}
