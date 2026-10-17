import { execFileSync } from "node:child_process";
import { PROJECTS, check } from "./contracts.mjs";
import { restReader, REQUIRED_PERMISSIONS, FORBIDDEN_PERMISSIONS } from "./rest-reader.mjs";
const hosts = Object.freeze({ resource: "https://cloudresourcemanager.googleapis.com", firestore: "https://firestore.googleapis.com", auth: "https://identitytoolkit.googleapis.com" });
export function assertReadRequest(identity, r) {
  check(PROJECTS.some(p => p.projectId === identity.projectId && p.projectNumber === identity.projectNumber && p.database === identity.database && p.region === identity.region));
  check(Object.hasOwn(hosts, r.host) && ["GET", "POST"].includes(r.method));
  const url = new URL(`${hosts[r.host]}/${r.path}`), base = `v1/projects/${identity.projectId}/databases/${identity.database}`;
  check(url.origin === hosts[r.host] && !url.username && !url.password && !url.hash);
  if (r.host === "resource") {
    if (r.method === "GET") check(r.path === `v3/projects/${identity.projectId}` && !r.body);
    else check(r.path === `v1/projects/${identity.projectId}:testIamPermissions` && JSON.stringify(r.body) === JSON.stringify({ permissions: [...REQUIRED_PERMISSIONS, ...FORBIDDEN_PERMISSIONS] }));
  } else if (r.host === "auth") check(r.method === "GET" && url.pathname === `/v1/projects/${identity.projectId}/accounts:batchGet` && !r.body);
  else if (r.method === "POST") check(r.path.startsWith(`${base}/documents`) && r.path.endsWith(":listCollectionIds") && Object.keys(r.body || {}).every(k => ["pageSize", "pageToken"].includes(k)) && r.body.pageSize === 100);
  else check(!r.body && (r.path === base || url.pathname.startsWith(`/${base}/documents/`)));
  return url;
}
async function json(response) {
  check(response.status === 200 && response.headers.get("content-type")?.includes("application/json") && response.body);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; check(size <= 4194304); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function cloudShellReaders({ acknowledged = false, env = process.env, run = execFileSync, fetcher = fetch, signal } = {}) {
  check(acknowledged && env.CLOUD_SHELL === "true");
  // No credential files, impersonation, supplied token overrides, debug hooks,
  // hosted website environment or emulator redirection in the owner executable.
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_LOGIN_CONFIG_FILE", "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "VERCEL_ENV", "NODE_OPTIONS", "NODE_DEBUG", "DEBUG"]) check(!env[key]);
  const command = args => { signal?.throwIfAborted(); return run("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000, maxBuffer: 1048576 }).trim(); };
  const accounts = JSON.parse(command(["auth", "list", "--filter=status:ACTIVE", "--format=json", "--quiet"]));
  check(Array.isArray(accounts) && accounts.length === 1 && typeof accounts[0].account === "string" && /^[^\s@]+@[^\s@]+$/.test(accounts[0].account) && !accounts[0].account.toLowerCase().endsWith(".gserviceaccount.com"));
  for (const property of ["auth/impersonate_service_account", "auth/credential_file_override", "auth/access_token_file"]) { const value = command(["config", "get-value", property, "--quiet"]); check(!value || value === "(unset)"); }
  const token = command(["auth", "print-access-token", `--account=${accounts[0].account}`, "--quiet"]); check(token.length > 20 && !/\s/.test(token));
  return PROJECTS.map(identity => restReader(identity, async request => {
    const url = assertReadRequest(identity, request);
    const response = await fetcher(url, { method: request.method, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, ...(request.body && { "Content-Type": "application/json" }) }, ...(request.body && { body: JSON.stringify(request.body) }) });
    return json(response);
  }));
}
