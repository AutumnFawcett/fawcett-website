import "server-only";
import {Firestore} from "@google-cloud/firestore";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {generateKeyPairSync,createHash,sign,verify} from "node:crypto";
const contexts=new WeakMap(),tokens=new WeakMap();let sequence=0;
const check=(ok,why)=>{if(!ok)throw Error(why);};
export const LOCAL_FINANCIAL_PROJECT="demo-fawcett-ledger";
function localConfiguration(requireAuth){
  check(!process.env.VERCEL_ENV&&!process.env.VERCEL&&process.env.NODE_ENV!=="production","deployed_financial_runtime_not_enabled");
  check(process.env.GCLOUD_PROJECT===LOCAL_FINANCIAL_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT===LOCAL_FINANCIAL_PROJECT
    &&process.env.FIRESTORE_EMULATOR_HOST==="127.0.0.1:8087","local_demo_emulator_required");
  check(requireAuth?process.env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9097"
    :!process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9097","local_auth_and_firestore_required");
}
// The only enabled writer profile constructs loopback SDKs itself. Deployed
// profiles intentionally have no implementation until resource/key attestation.
export function createLocalFinancialDependencies({requireAuth=true}={}){
  localConfiguration(requireAuth);
  const app=initializeApp({projectId:LOCAL_FINANCIAL_PROJECT},`financial-runtime-${++sequence}`),auth=getAuth(app);
  const db=new Firestore({projectId:LOCAL_FINANCIAL_PROJECT,databaseId:"(default)",host:"127.0.0.1:8087",ssl:false});
  db.settings({}); // Supported one-time settings call freezes endpoint configuration.
  const runtime=Object.freeze({schemaVersion:1,mode:"emulator",environment:"sandbox",projectId:LOCAL_FINANCIAL_PROJECT,databaseId:"(default)"});
  const keys=Object.fromEntries(["principal","policy","provider","booking","completion","audit","consent","approval","journal"].map(kind=>[kind,generateKeyPairSync("ed25519")]));
  const context={db,auth,runtime,requireAuth,
    issuerKeyId:kind=>createHash("sha256").update(keys[kind].publicKey.export({type:"spki",format:"der"})).digest("hex"),
    signOwnership:(kind,bytes)=>sign(null,bytes,keys[kind].privateKey).toString("base64"),
    verifyOwnership:(kind,bytes,signature)=>verify(null,bytes,keys[kind].publicKey,Buffer.from(signature,"base64"))};contexts.set(db,context);tokens.set(runtime,context);
  return {db,auth,runtime,close:()=>deleteApp(app)};
}
export function localLedgerContext(db){
  // DocumentReference.firestore is a supported SDK property. Test transaction
  // instrumentation may wrap methods but must retain the original SDK refs.
  const actual=db?.doc?.("financialRuntime/probe")?.firestore,ctx=contexts.get(actual);
  check(ctx,"unbound_financial_database");localConfiguration(ctx.requireAuth);
  check(actual.projectId===ctx.runtime.projectId&&actual.databaseId===ctx.runtime.databaseId,"financial_database_identity_mismatch");
  return ctx;
}
export function assertFinancialRuntime({db,auth,projectId,runtime},scope){
  check(runtime&&tokens.has(runtime),"financial_runtime_required");
  const ctx=localLedgerContext(db);
  check(tokens.get(runtime)===ctx&&ctx.requireAuth&&auth===ctx.auth,"financial_auth_database_binding_mismatch");
  check(projectId===runtime.projectId&&auth.app.options.projectId===runtime.projectId,"financial_auth_project_mismatch");
  if(scope)check(scope.environment===runtime.environment,"financial_environment_mismatch");
  return runtime;
}
