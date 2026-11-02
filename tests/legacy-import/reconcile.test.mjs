import test from "node:test";
import assert from "node:assert/strict";
import { reconcileLegacy } from "../../lib/ledger/import/reconcile.mjs";
import { validateManifest, sourceKey, importId, providerKey, digest } from "../../lib/ledger/import/manifest.mjs";
import { row, provider, allocation, manifest, source, usage } from "./fixtures.mjs";
const decision = (report, original) => report.decisions.find(d => d.sourceKey === sourceKey(original));
const has = (report, reason) => report.decisions.some(d => d.reasons.includes(reason)) || report.clients.some(c => c.reviewReasons.includes(reason));

test("manual received value stays an attested candidate, never provider-confirmed or executable", () => {
  const r = reconcileLegacy(manifest());
  assert.equal(r.executionAllowed, false); assert.equal(r.decisions[0].classification, "candidate");
  assert.equal(r.decisions[0].providerConfirmed, false); assert.equal(r.clients[0].proposedPurchasedCents, 30000);
  assert.equal(r.clients[0].candidateCollectedCents, 30000);
  assert.equal(r.clients[0].differences.dashboardCents, 30000); assert.ok(has(r,"shadow_balance_discrepancy"));
});

test("source and manifest IDs are stable and independent of input ordering; input is unchanged", () => {
  const a = row(), b = usage(), input = manifest([a,b]); const before = structuredClone(input);
  assert.deepEqual(reconcileLegacy(input), reconcileLegacy(manifest([b,a]))); assert.deepEqual(input,before);
  assert.equal(importId(a), importId({ ...a, amountCents: 1, resolvedClientUid: "other" }));
  assert.notEqual(reconcileLegacy(input).manifestHash, reconcileLegacy(manifest([row({ amountCents: 1 })])).manifestHash);
});

test("duplicate original records are held, not counted twice", () => {
  const r = reconcileLegacy(manifest([row(),row()]));
  assert.ok(has(r,"duplicate_source_record")); assert.equal(r.clients[0].proposedPurchasedCents,0);
});

test("duplicate provider identities across sources and clients are held", () => {
  const a = row({ method:"square",provider:provider() }), b = row({ source:source("payment_2"), method:"square",provider:provider() });
  const r = reconcileLegacy(manifest([a,b])); assert.ok(has(r,"duplicate_provider_identity"));
  assert.ok(r.decisions.every(d => d.proposedCreditDeltaCents===0));
});

test("reviewed creditLedger mirror is excluded only with an exact scoped link", () => {
  const a = row(), mirror = row({ source:source("mirror_1","creditLedger"),mirrorOf:sourceKey(a),mirrorApprovalId:"mirror_review" });
  let r = reconcileLegacy(manifest([a,mirror])); assert.equal(decision(r,mirror).classification,"excluded"); assert.equal(r.clients[0].proposedPurchasedCents,30000);
  r=reconcileLegacy(manifest([a,{ ...mirror,amountCents:1 }])); assert.ok(has(r,"mirror_link_conflict"));
  assert.ok(has(reconcileLegacy(manifest([row({source:source("standalone","creditLedger")})])),"standalone_credit_ledger_review"));
});

test("conflicting UID/email identities cannot create cross-client credit", () => {
  for(const patch of [{originalClientUid:"other"},{resolvedClientUid:null},{identityEvidenceId:null},{emailKey:digest("different_email")}]) {
    const r=reconcileLegacy(manifest([row(patch)])); assert.ok(has(r,"identity_conflict_or_unresolved")); assert.equal(r.decisions[0].proposedCreditDeltaCents,0);
  }
  const m=manifest();m.identities.push({uid:"other",emailKey:m.identities[0].emailKey,evidenceId:"identity_2"});
  assert.ok(has(reconcileLegacy(m),"identity_conflict_or_unresolved"));
});

test("missing/cross-client projects, appointments and conflicting artists require review", () => {
  assert.ok(has(reconcileLegacy(manifest([row()],{projects:[]})),"project_missing_or_cross_client"));
  const m=manifest();m.projects[0].clientUid="other";assert.ok(has(reconcileLegacy(m),"project_missing_or_cross_client"));
  assert.ok(has(reconcileLegacy(manifest([row({artistId:"other"})])),"artist_unresolved_or_conflicting"));
  assert.ok(has(reconcileLegacy(manifest([row({appointmentId:"missing"})])),"appointment_missing_or_cross_client"));
});

test("verification flags alone, mismatches, unavailable evidence and manual electronic references are insufficient", () => {
  for(const p of [provider({verification:"manual"}),provider({readbackHash:null}),provider({status:"PENDING"}),provider({amountCents:1}),provider({clientUid:"other"}),provider({environment:"sandbox"})]) {
    const r=reconcileLegacy(manifest([row({method:"square",provider:p})]));assert.ok(has(r,"provider_unverified_or_mismatched"));assert.equal(r.decisions[0].providerConfirmed,false);
  }
  const r=reconcileLegacy(manifest([row({manualEvidenceId:null})]));assert.ok(has(r,"received_payment_unverified"));
  assert.throws(()=>validateManifest(manifest([row({providerConfirmed:true})])),/invalid_import_contract/);
});

test("consistent synthetic CARD readback can qualify a receipt without changing its financial origin", () => {
  const r=reconcileLegacy(manifest([row({method:"square",provider:provider()})]));
  assert.equal(r.decisions[0].providerConfirmed,true);assert.equal(r.decisions[0].classification,"candidate");assert.equal(r.executionAllowed,false);
});

test("EXTERNAL bookkeeping and contradictory external details are always excluded", () => {
  for(const p of [provider({sourceType:"EXTERNAL"}),provider({externalDetailsPresent:true})]) {
    const r=reconcileLegacy(manifest([row({method:"square",provider:p})]));
    assert.ok(has(r,"external_bookkeeping_excluded"));assert.equal(r.decisions[0].providerConfirmed,false);assert.equal(r.clients[0].candidateCollectedCents,0);
  }
  const a=row();assert.ok(has(reconcileLegacy(manifest([a],{exclusions:[{sourceKey:sourceKey(a),reason:"historical_external_false_positive"}]})),"explicit_exclusion"));
});

test("Sandbox and unknown source environments cannot become Production funds", () => {
  for(const a of [row({environment:"sandbox",source:source("sandbox_payment","payments","synthetic_sandbox")}),row({source:source("sandbox_payment","tattooSandboxTransactions")}),row({source:source("mislabeled","payments","synthetic_sandbox")})]) {
    const r=reconcileLegacy(manifest([a]));assert.equal(r.decisions[0].proposedCreditDeltaCents,0);assert.equal(r.clients[0].candidateCollectedCents,0);
  }
});

test("partial/over allocations, missing policy and combined booking-fee/deposit labels never auto-convert into Studio Credit", () => {
  assert.ok(has(reconcileLegacy(manifest([row({allocations:[allocation(10000)]})])),"partially_unallocated"));
  assert.equal(reconcileLegacy(manifest([row({allocations:[allocation(10000)]})])).decisions[0].unallocatedCents,20000);
  assert.ok(has(reconcileLegacy(manifest([row({allocations:[allocation(40000)]})])),"overallocated"));
  assert.ok(has(reconcileLegacy(manifest([row({allocations:[allocation(30000,{policy:null})]})])),"policy_or_acceptance_missing"));
  assert.ok(has(reconcileLegacy(manifest([row({paymentType:"booking_fee_deposit"})])),"booking_fee_advance_ambiguity"));
});

test("partial tattoo use preserves restricted purchased value without receiving new money", () => {
  const r=reconcileLegacy(manifest([row(),usage(10000)]));
  assert.equal(r.clients[0].proposedPurchasedCents,20000);assert.equal(r.clients[0].candidateCollectedCents,30000);
  assert.equal(r.clients[0].buckets[0].projectId,"project_1");assert.equal(r.clients[0].buckets[0].remainingCents,20000);
});

test("historical adjustments require their own approval and do not count as new receipts", () => {
  const adjustment=row({source:source("correction"),kind:"adjustment",amountCents:5000,allocations:[allocation(5000)],adjustmentApprovalId:"owner_correction",paymentType:"other"});
  const r=reconcileLegacy(manifest([row(),adjustment]));assert.equal(r.clients[0].proposedPurchasedCents,35000);assert.equal(r.clients[0].candidateCollectedCents,30000);
  assert.ok(has(reconcileLegacy(manifest([{...adjustment,adjustmentApprovalId:null}])),"historical_adjustment_unapproved"));
});

test("negative/overconsumed funding is held, even if another receipt could cover the aggregate", () => {
  const a=row(),b=row({source:source("extra_funding"),manualEvidenceId:"separate_receipt"}),u=usage(30000,{source:source("use_a")}),v=usage(10000,{source:source("use_b"),manualEvidenceId:"second_service_event"});
  const r=reconcileLegacy(manifest([a,b,u,v]));assert.ok(has(r,"funding_overconsumed"));assert.equal(decision(r,u).proposedCreditDeltaCents,0);
  const adjustment=row({source:source("negative_adjustment"),kind:"adjustment",creditEffect:"remove",adjustmentApprovalId:"owner",amountCents:40000,allocations:[allocation(40000)]});
  assert.ok(has(reconcileLegacy(manifest([a,adjustment])),"negative_restricted_bucket"));
});

test("the same manual receipt cannot fund different original IDs or clients twice", () => {
  const a=row(),b=row({source:source("manual_duplicate")});
  const r=reconcileLegacy(manifest([a,b]));assert.ok(has(r,"duplicate_manual_receipt_evidence"));assert.equal(r.clients[0].candidateCollectedCents,0);
});

test("cross-client, unverified, early or restricted funding references cannot be consumed", () => {
  assert.ok(has(reconcileLegacy(manifest([row({manualEvidenceId:null}),usage()])),"funding_not_candidate"));
  assert.ok(has(reconcileLegacy(manifest([row(),usage(10000,{originalTimestamp:"2026-09-01T00:00:00.000Z"})])),"usage_precedes_funding"));
  assert.ok(has(reconcileLegacy(manifest([row(),usage(10000,{relatedSourceKey:digest("other_client_record")})])),"funding_reference_missing_or_cross_client"));
});

test("existing source/import/journal/provider guards prevent re-import or overwrite", () => {
  const a=row(),guard={sourceKey:sourceKey(a),importId:importId(a),recordHash:a.source.recordHash,clientUid:"client_1",providerKey:null};
  assert.ok(has(reconcileLegacy(manifest([a],{existingImports:[guard]})),"already_imported"));
  assert.ok(has(reconcileLegacy(manifest([a],{existingImports:[{...guard,clientUid:"other"}]})),"existing_import_conflict"));
  assert.ok(has(reconcileLegacy(manifest([a],{existingAccounts:[{clientUid:"client_1",revision:1,purchasedCents:30000,journalIds:[importId(a)]}]})),"journal_id_collision"));
  const card=row({provider:provider(),method:"square"});
  assert.ok(has(reconcileLegacy(manifest([card],{existingImports:[{...guard,sourceKey:digest("different_source"),importId:"different_import",providerKey:providerKey(card)}]})),"duplicate_provider_identity"));
});

test("opening balances cannot be layered onto existing accounts or mixed with replay strategy", () => {
  assert.ok(has(reconcileLegacy(manifest([row()],{existingAccounts:[{clientUid:"client_1",revision:1,purchasedCents:1000,journalIds:[]}]})),"opening_balance_would_overlap_existing_journal"));
  assert.ok(has(reconcileLegacy(manifest([row()],{strategies:[{clientUid:"client_1",mode:"replay"},{clientUid:"client_1",mode:"opening_balance"}]})),"strategy_missing_or_mixed"));
});

test("refunded status, disputes, legacy snapshots, failed installments and cutoff remain explicit", () => {
  assert.ok(has(reconcileLegacy(manifest([usage(5000,{kind:"refund",status:"refunded",creditEffect:"remove"})])),"legacy_refund_status_review"));
  assert.ok(has(reconcileLegacy(manifest([row({kind:"dispute",creditEffect:"none"})])),"dispute_reservation_review"));
  for(const patch of [{kind:"snapshot",creditEffect:"none"},{status:"failed"},{status:"pending"},{originalTimestamp:"2026-12-01T00:00:00.000Z"}]) assert.equal(reconcileLegacy(manifest([row(patch)])).clients[0].candidateCollectedCents,0);
});

test("three legacy observations are compared separately, and an exact shadow match still cannot execute", () => {
  const observations=[{clientUid:"client_1",creditPageCents:30000,adminLedgerCents:30000,dashboardCents:30000}];
  const r=reconcileLegacy(manifest([row()],{observations}));assert.equal(r.clients[0].status,"shadow_match");assert.equal(r.reviewRequired,false);assert.equal(r.executionAllowed,false);
});

test("unsafe money, unknown fields, invalid timestamps and unsupported schema versions reject", () => {
  for(const patch of [{amountCents:0.1},{amountCents:Number.MAX_SAFE_INTEGER+1},{originalTimestamp:"2026-02-30T00:00:00.000Z"},{secret:"forbidden"}]) assert.throws(()=>reconcileLegacy(manifest([row(patch)])),/invalid_import_contract/);
  assert.throws(()=>reconcileLegacy({...manifest(),schemaVersion:2}),/invalid_import_contract/);
});

test("refund/use/adjustment event evidence and approval IDs cannot deduct twice", () => {
  const a=usage(5000),b=usage(5000,{source:source("duplicate_event")});
  assert.ok(has(reconcileLegacy(manifest([row(),a,b])),"duplicate_financial_event_evidence"));
  const x=usage(5000,{kind:"refund",creditEffect:"remove",adjustmentApprovalId:"refund_approval"});
  const y={...x,source:source("second_refund"),manualEvidenceId:"other_refund_evidence"};
  assert.ok(has(reconcileLegacy(manifest([row(),x,y])),"duplicate_adjustment_approval"));
  assert.ok(has(reconcileLegacy(manifest([row(),usage(10000,{allocations:[allocation(10000,{kind:"session"})]})])),"credit_consumption_bucket_missing"));
});

test("currency, timestamp, source schema and purchased-policy gaps are explicit holds", () => {
  for(const [patch,reason] of [[{currency:null},"currency_missing_or_unsupported"],[{originalTimestamp:null},"timestamp_provenance_missing"],
    [{source:source("unknown","unmappedRecords")},"source_schema_unmapped"],[{allocations:[allocation(30000,{policy:null})]},"policy_or_acceptance_missing"]]) {
    assert.ok(has(reconcileLegacy(manifest([row(patch)])),reason));
  }
});

test("original document IDs are preserved verbatim without becoming ledger paths", () => {
  const a=row({source:source("legacy.id with spaces@synthetic")});
  assert.equal(validateManifest(manifest([a])).records[0].source.id,a.source.id);
  assert.match(importId(a),/^legacy_[a-f0-9]{64}$/);
  assert.throws(()=>validateManifest(manifest([row({source:source("invalid/path")})])),/invalid_import_contract/);
});

test("incomplete, unapproved or changed snapshot coverage holds an otherwise matching report", () => {
  for(const patch of [{complete:false},{coverageEvidenceId:null},{recordCount:0},{recordSetHash:digest("changed")},{capturedAt:"2026-10-01T00:00:00.000Z"}]) {
    const m=manifest();Object.assign(m.snapshot,patch);const r=reconcileLegacy(m);
    assert.ok(r.manifestReviewReasons.includes("snapshot_coverage_unapproved_or_changed"));assert.equal(r.executionAllowed,false);assert.equal(r.reviewRequired,true);
  }
});
