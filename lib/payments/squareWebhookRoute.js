const SENSITIVE_ENV_NAME = /(token|secret|password|credential|private.?key|signature.?key)/i;
const SENSITIVE_TEXT = /(bearer\s+\S+|-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----|(?:access[_ -]?token|private[_ -]?key|signature[_ -]?key|password|secret)\s*[:=]\s*\S+)/gi;

function safeDiagnostic(value) {
  let text = typeof value === "string" ? value : value == null ? "" : String(value);
  for (const [name, secret] of Object.entries(process.env)) {
    if (SENSITIVE_ENV_NAME.test(name) && typeof secret === "string" && secret.length >= 4) text = text.split(secret).join("[redacted]");
  }
  return text.replace(SENSITIVE_TEXT, "[redacted]");
}

export function createDiagnostic(stage, error) {
  return {
    stage,
    name: safeDiagnostic(error?.name),
    code: safeDiagnostic(error?.code),
    message: safeDiagnostic(error?.message),
  };
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function handleFirebaseAdminConnectivityRequest({ getFirebaseAdmin, vercelEnvironment = process.env.VERCEL_ENV }) {
  if (vercelEnvironment !== "preview") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: NO_STORE });
  }

  try {
    const { firestore } = getFirebaseAdmin();
    await firestore.collection("__diagnostics__").doc("firebase-admin-connection").get();
    return Response.json({ ok: true }, { status: 200, headers: NO_STORE });
  } catch (error) {
    return Response.json({
      ok: false,
      diagnostic: createDiagnostic("firebase_connectivity", error),
    }, { status: 503, headers: NO_STORE });
  }
}

function logFailure(diagnostic, logger) {
  logger.error(`[square-webhook-failure] ${JSON.stringify(diagnostic)}`);
}

function failureResponse(stage, reason, error, logger) {
  const diagnostic = createDiagnostic(stage, error);
  logFailure(diagnostic, logger);
  return Response.json({
    outcome: "retryable",
    reason,
    ...(process.env.VERCEL_ENV === "preview" && { diagnostic }),
  }, { status: 503 });
}

export async function handleSquareWebhookRequest(request, dependencies) {
  let config;
  try {
    config = dependencies.getConfig();
  } catch (error) {
    return failureResponse("configuration", "server_configuration_unavailable", error, dependencies.logger);
  }

  try {
    const { firestore } = dependencies.getFirebaseAdmin();
    const result = await dependencies.handleWebhook({ request, config, firestore, now: dependencies.now });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return failureResponse("processing", "processing_unavailable", error, dependencies.logger);
  }
}
