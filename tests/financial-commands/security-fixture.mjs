// Disposable, loopback-only bootstrap. Never imported by application code.
import {createOwnershipWriter,ownershipKind,ownershipPath} from "../../lib/financial-security/ownership.mjs";
import {localLedgerContext} from "../../lib/financial-security/runtime.mjs";
export async function sealSyntheticRecords(db,paths){
  localLedgerContext(db);const writer=createOwnershipWriter(db,"fixture");
  for(const path of paths){
    const value=(await db.doc(path).get()).data();if(!value)throw Error("missing_synthetic_fixture");
    const ref=db.doc(ownershipPath(db,path,value));if((await ref.get()).exists)continue;
    const batch=db.batch();writer.seal(batch,ownershipKind(path),path,value);await batch.commit();
  }
}
