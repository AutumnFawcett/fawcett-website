import "server-only";
import {deferStagedOwnership} from "../ledger/server/staged-posting.mjs";
import {hash,canonical,check} from "../agreements/contracts.mjs";
import {localLedgerContext} from "./runtime.mjs";
const grants={command:["audit","consent","approval"],role:["principal","audit"],ledger:["journal"],fixture:["principal","policy","provider","booking","completion","audit","consent","approval","journal"]};
export function ownershipKind(path){
  if(/^financialCommandPrincipals\//.test(path))return "principal";
  if(/^financial(Agreement|Ledger)Policies\//.test(path))return "policy";
  if(/^financialCommandAudits\//.test(path)||/^financial(AuthorizationDecisions|RoleOperations)\//.test(path))return "audit";
  if(/^financialLedgerEvidence\/[^/]+\/(payments|refunds)\//.test(path)||/\/(readbacks|providerOrders)\//.test(path))return "provider";
  if(/\/(serviceCompletions|serviceCompletionHeads)\//.test(path))return "completion";
  if(/\/(projects|appointments|agreements)\//.test(path)||/^financialLedgerEvidence\/[^/]+\/requests\//.test(path))return "booking";
  if(/\/(consents|consentOperations)\//.test(path))return "consent";
  if(/\/approvals\//.test(path))return "approval";
  if(/\/(journal|operations|familyOperations)\//.test(path))return "journal";
  throw Error("ownership_kind_not_supported");
}
const issuerKeyId=(ctx,kind)=>ctx.issuerKeyId(kind);
export const ownershipPath=(db,path,value)=>`financialRecordOwnership/${hash([path,hash(value),issuerKeyId(localLedgerContext(db),ownershipKind(path))])}`;
export function createOwnershipWriter(db,producer){
  const ctx=localLedgerContext(db);check(Object.hasOwn(grants,producer),"unknown_record_producer");
  return {seal(batch,kind,path,value){
    localLedgerContext(db);check(grants[producer].includes(kind)&&ownershipKind(path)===kind,"unauthorized_record_writer");
    check(kind!=="audit"||producer==="fixture"||(producer==="role"?/^financial(AuthorizationDecisions|RoleOperations)\//.test(path):path.startsWith("financialCommandAudits/")),"unauthorized_record_writer");
    const payload={schemaVersion:1,issuerKeyId:issuerKeyId(ctx,kind),kind,path,recordHash:hash(value),projectId:ctx.runtime.projectId,databaseId:ctx.runtime.databaseId,environment:ctx.runtime.environment};
    if(deferStagedOwnership(batch,kind,ownershipPath(db,path,value),payload))return;
    const signature=ctx.signOwnership(kind,Buffer.from(canonical(payload)));
    batch.create(db.doc(ownershipPath(db,path,value)),{...payload,signature});
  }};
}
export async function requireOwnership(tx,db,kind,path,value){
  const ctx=localLedgerContext(db);check(ownershipKind(path)===kind,"unauthorized_record_writer");
  const seal=(await tx.get(db.doc(ownershipPath(db,path,value)))).data();
  const payload={schemaVersion:1,issuerKeyId:issuerKeyId(ctx,kind),kind,path,recordHash:hash(value),projectId:ctx.runtime.projectId,databaseId:ctx.runtime.databaseId,environment:ctx.runtime.environment};
  let valid=seal&&Object.keys(seal).length===Object.keys(payload).length+1&&Object.entries(payload).every(([k,v])=>seal[k]===v);
  try{valid=valid&&ctx.verifyOwnership(kind,Buffer.from(canonical(payload)),seal.signature);}catch{valid=false;}
  check(valid,`${kind}_ownership_required`);return true;
}
