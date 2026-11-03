import test from "node:test";
import assert from "node:assert/strict";
import {financialImportViolations} from "../../lib/financial-security/architecture.mjs";
test("signed attendance and registry/staging internals cannot be imported by application routes or generic utilities",()=>{
  for(const target of ["financial-commands/signed-attendance","financial-security/registry-emulator","ledger/server/staged-posting"])
    for(const file of ["app/api/unsafe/route.js","components/Unsafe.js","lib/unsafe.mjs"])
      assert.ok(financialImportViolations([{path:file,code:`import {anything} from '@/lib/${target}.mjs'`}]).length);
});
