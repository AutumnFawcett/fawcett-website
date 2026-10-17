import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseInitializer } from '../../lib/firebaseInitialization.mjs';

const config = {
  apiKey: 'synthetic-test-only', authDomain: 'demo-fawcett-dev.firebaseapp.com',
  projectId: 'demo-fawcett-dev', storageBucket: 'demo-fawcett-dev.appspot.com',
  messagingSenderId: '1234567890', appId: 'synthetic-test-app',
};
function fixture(options = config) {
  const calls = [];
  const app = { name: '[DEFAULT]', options };
  const auth = {}, db = {}, storage = {};
  const sdk = {
    getApps: () => { calls.push('getApps'); return []; },
    getApp: () => app,
    initializeApp: (value) => { calls.push('initializeApp'); assert.deepEqual(value, config); return app; },
    getAuth: () => { calls.push('getAuth'); return auth; },
    getFirestore: () => { calls.push('getFirestore'); return db; },
    getStorage: () => { calls.push('getStorage'); return storage; },
  };
  return { sdk, calls, app, services: { auth, db, storage } };
}
test('import/construction and server invocation never initialize any Firebase service', () => {
  const { sdk, calls } = fixture();
  const init = createFirebaseInitializer(config, sdk, () => false);
  assert.deepEqual(calls, []);
  assert.throws(init, /cannot initialize on the server/);
  assert.deepEqual(calls, []);
});
test('missing, empty and partial configuration fails without SDK calls or fallback credentials', () => {
  for (const key of Object.keys(config)) {
    for (const missing of [undefined, '', '   ']) {
      const { sdk, calls } = fixture();
      assert.throws(createFirebaseInitializer({ ...config, [key]: missing }, sdk, () => true), /incomplete/);
      assert.deepEqual(calls, []);
    }
  }
});
test('configured browser retains real SDK object identities and initializes once', () => {
  const { sdk, calls, services } = fixture();
  const init = createFirebaseInitializer(config, sdk, () => true);
  assert.deepEqual(init(), services);
  assert.equal(init().auth, services.auth);
  assert.equal(init().db, services.db);
  assert.equal(init().storage, services.storage);
  assert.deepEqual(calls, ['getApps', 'initializeApp', 'getAuth', 'getFirestore', 'getStorage']);
});
test('matching existing default app is reused, conflicting app is rejected', () => {
  for (const conflict of [false, true]) {
    const { sdk, app, calls } = fixture(conflict ? { ...config, projectId: 'unexpected-project' } : config);
    sdk.getApps = () => [app];
    const init = createFirebaseInitializer(config, sdk, () => true);
    if (conflict) {
      assert.throws(init, /does not match/);
      assert.deepEqual(calls, []);
    } else {
      init();
      assert.deepEqual(calls, ['getAuth', 'getFirestore', 'getStorage']);
    }
  }
});
test('SDK authentication errors propagate, never replaced with a working-looking fallback', () => {
  const { sdk } = fixture();
  const error = new Error('auth/invalid-api-key');
  sdk.getAuth = () => { throw error; };
  assert.throws(createFirebaseInitializer(config, sdk, () => true), (value) => value === error);
});
