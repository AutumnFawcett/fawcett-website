// Build-time import check only. This is not a runtime/IAM sandbox.
import {Linter} from "eslint";
import path from "node:path";
const publicEntry="lib/financial-commands/index.mjs";
const allowed=new Set(["lib/financial-commands/signed-attendance.mjs","lib/financial-security/registry-emulator.mjs","lib/ledger/server/staged-posting.mjs","lib/financial-security/protocol/registry.mjs","lib/financial-security/protocol/artifacts.mjs","lib/financial-security/protocol/proposal.mjs","lib/financial-commands/service.mjs",publicEntry,"lib/financial-security/authorization.mjs","lib/financial-security/roles.mjs",
  "lib/financial-security/runtime.mjs","lib/financial-security/ownership.mjs","lib/ledger/server/firestore.mjs","lib/ledger/server/funding-family.mjs"]);
const protectedPath=p=>p.startsWith("lib/ledger/server/")||p.startsWith("lib/financial-security/")&&p!=="lib/financial-security/architecture.mjs"
  ||p==="lib/financial-commands/signed-attendance.mjs"||p==="lib/financial-commands/service.mjs";
export function financialImportViolations(files){
  const violations=[];
  for(const file of files){
    let client=false;
    const inspect=source=>{
      if(typeof source!=="string"){violations.push(`${file.path}: nonliteral module loading requires review`);return;}
      let target=source.startsWith("@/")?source.slice(2):source.startsWith(".")?path.posix.normalize(path.posix.join(path.posix.dirname(file.path),source)):source;
      if(!path.posix.extname(target))target+=".mjs";
      if((protectedPath(target)&&!allowed.has(file.path))||(client&&(protectedPath(target)||target===publicEntry)))
        violations.push(`${file.path}: forbidden financial import ${target}`);
      if(source.includes("tests/")&&!file.path.startsWith("tests/")&&!(file.path==="scripts/reconcile-legacy-synthetic.mjs"&&target==="tests/legacy-import/fixtures.mjs"))violations.push(`${file.path}: test authority import`);
    };
    const messages=new Linter().verify(file.code,[{files:["**/*.{js,mjs,cjs}"],languageOptions:{ecmaVersion:"latest",sourceType:"module",parserOptions:{ecmaFeatures:{jsx:true}}},
      plugins:{boundary:{rules:{imports:{create:()=>({
        Program:node=>{client=node.body.some(n=>n.type==="ExpressionStatement"&&n.expression.value==="use client");},
        ImportDeclaration:node=>inspect(node.source.value),
        ExportNamedDeclaration:node=>{if(node.source)inspect(node.source.value);},
        ExportAllDeclaration:node=>inspect(node.source.value),
        ImportExpression:node=>inspect(node.source.type==="Literal"?node.source.value:null),
        CallExpression:node=>{if(node.callee.type==="Identifier"&&node.callee.name==="require")inspect(node.arguments[0]?.type==="Literal"?node.arguments[0].value:null);}
      })}}}},rules:{"boundary/imports":"error"}}],{filename:file.path});
    if(messages.some(m=>m.fatal))violations.push(`${file.path}: cannot validate module imports`);
  }
  return violations;
}
