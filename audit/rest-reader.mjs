import { check, MASK } from "./contracts.mjs";
export const REQUIRED_PERMISSIONS = Object.freeze(["resourcemanager.projects.get", "datastore.databases.getMetadata", "datastore.entities.get", "datastore.entities.list", "firebaseauth.users.get"]);
export const FORBIDDEN_PERMISSIONS = Object.freeze(["datastore.entities.create", "datastore.entities.update", "datastore.entities.delete", "datastore.databases.create", "datastore.databases.update", "datastore.databases.delete", "datastore.databases.import", "datastore.databases.export", "datastore.indexes.create", "datastore.indexes.update", "datastore.indexes.delete", "firebaseauth.users.create", "firebaseauth.users.update", "firebaseauth.users.delete", "firebaseauth.users.sendEmail", "firebaseauth.configs.getHashConfig", "resourcemanager.projects.setIamPolicy", "iam.serviceAccounts.getAccessToken", "firebaserules.releases.create", "firebaserules.releases.update", "firebaserules.releases.delete", "firebaserules.rulesets.create", "storage.objects.create", "storage.objects.update", "storage.objects.delete", "serviceusage.services.enable"]);
const segment = v => typeof v === "string" && v.length > 0 && v.length <= 1500 && !/[\/\u0000-\u001f]/.test(v);
const query = values => new URLSearchParams(values).toString();
const scopes = new WeakSet();
// This adapter has NO general request, SDK, write, export or mutation method.
// Only fixed GETs and the two read-only POST methods below can be issued.
export function restReader(identity, transport, { synthetic = false } = {}) {
  check(identity && Object.keys(identity).length === 4 && ["projectId", "projectNumber", "database", "region"].every(k => Object.hasOwn(identity, k)));
  check(/^[a-z][a-z0-9-]{4,60}$/.test(identity.projectId) && /^\d{12}$/.test(identity.projectNumber) && identity.database === "(default)" && identity.region === "nam5");
  check(!synthetic || identity.projectId.startsWith("demo-"));
  identity = Object.freeze({ ...identity });
  const prefix = `projects/${identity.projectId}/databases/${identity.database}`, documents = `${prefix}/documents`;
  let verified = false;
  const call = (host, method, path, body) => transport({ host, method, path, body });
  const reader = Object.freeze({
    identity,
    async verify() {
      const project = await call("resource", "GET", `v3/projects/${identity.projectId}`);
      check(project.projectId === identity.projectId && project.name === `projects/${identity.projectNumber}` && project.state === "ACTIVE");
      const database = await call("firestore", "GET", `v1/${prefix}`);
      check(database.name === prefix && database.locationId === identity.region && database.type === "FIRESTORE_NATIVE");
      if (!synthetic) {
        const permissions = [...REQUIRED_PERMISSIONS, ...FORBIDDEN_PERMISSIONS];
        const result = await call("resource", "POST", `v1/projects/${identity.projectId}:testIamPermissions`, { permissions });
        check(Array.isArray(result.permissions) && result.permissions.every(p => permissions.includes(p)) && REQUIRED_PERMISSIONS.every(p => result.permissions.includes(p)) && !FORBIDDEN_PERMISSIONS.some(p => result.permissions.includes(p)));
      }
      verified = true;
    },
    async collections(parent, pageToken = "") {
      check(verified && (parent === "" || parent.split("/").length % 2 === 0 && parent.split("/").every(segment)));
      return call("firestore", "POST", `v1/${documents}${parent ? `/${parent.split("/").map(encodeURIComponent).join("/")}` : ""}:listCollectionIds`, { pageSize: 100, ...(pageToken && { pageToken }) });
    },
    async documents(collection, pageToken = "") {
      check(verified && collection.split("/").length % 2 === 1 && collection.split("/").every(segment));
      const params = new URLSearchParams({ pageSize: "100", showMissing: "true", ...(pageToken && { pageToken }) });
      MASK.forEach(field => params.append("mask.fieldPaths", field));
      return call("firestore", "GET", `v1/${documents}/${collection.split("/").map(encodeURIComponent).join("/")}?${params}`);
    },
    async accounts(pageToken = "") {
      check(verified);
      return call("auth", "GET", `v1/projects/${identity.projectId}/accounts:batchGet?${query({ maxResults: "1000", fields: "users(localId,email,disabled,createdAt,providerUserInfo(providerId,rawId)),nextPageToken", ...(pageToken && { nextPageToken: pageToken }) })}`);
    }
  });
  scopes.add(reader); return reader;
}
export function assertReader(reader) { check(scopes.has(reader)); }
