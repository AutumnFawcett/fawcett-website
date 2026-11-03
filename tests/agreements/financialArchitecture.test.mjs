import test from "node:test";
import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {financialImportViolations} from "../../lib/financial-security/architecture.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
async function files(dir){const result=[];for(const d of await readdir(path.join(root,dir),{withFileTypes:true})){
  const p=`${dir}/${d.name}`;if(d.isDirectory())result.push(...await files(p));else if(/\.(mjs|js|cjs)$/.test(p))result.push({path:p,code:await readFile(path.join(root,p),"utf8")});
}return result;}
test("application modules cannot import/re-export raw financial adapters or test authorities",async()=>{
  const entries=(await Promise.all(["app","components","lib","scripts"].map(files))).flat();
  assert.deepEqual(financialImportViolations(entries),[]);
});
test("architectural check detects static, aliased, dynamic and barrel bypasses",()=>{
  for(const code of ["import {x} from '@/lib/ledger/server/firestore.mjs'","export * from './ledger/server/firestore.mjs'","import('../lib/financial-security/ownership.mjs')","import(variable)"])
    assert.ok(financialImportViolations([{path:"lib/unsafe.mjs",code}]).length);
  assert.ok(financialImportViolations([{path:"components/Unsafe.js",code:"'use client'; import {x} from '@/lib/financial-commands/index.mjs'"}]).length);
  assert.deepEqual(financialImportViolations([{path:"app/api/future/route.js",code:"import {x} from '@/lib/financial-commands/index.mjs'"}]),[]);
});
