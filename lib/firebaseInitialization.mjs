// No SDK calls at module load. The UI invokes this only after browser mount.
export function createFirebaseInitializer(config, sdk, isBrowser) {
  let services;
  return function initialize() {
    if (!isBrowser()) throw new Error('Firebase browser services cannot initialize on the server.');
    if (services) return services;
    if (Object.values(config).some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error('Firebase configuration is incomplete.');
    }
    const app = sdk.getApps().some((app) => app.name === '[DEFAULT]')
      ? sdk.getApp()
      : sdk.initializeApp(config);
    // Never reuse another project's default app (including during hot reload).
    if (Object.keys(config).some((key) => app.options[key] !== config[key])) {
      throw new Error('Firebase configuration does not match the initialized application.');
    }
    services = { auth: sdk.getAuth(app), db: sdk.getFirestore(app), storage: sdk.getStorage(app) };
    return services;
  };
}
