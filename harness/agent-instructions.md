# AI Coding Agent Governance & Operating Protocol

This document defines the strict, binding protocol for any AI coding agent, engineer, or automated system working inside the 60SEC codebase.

---

## 1. Mandatory Pre-Flight Checklist

Before modifying, creating, or deleting any lines of application code or database schema, you **MUST** execute the following 10-step protocol:

1. **Read `/harness/README.md`**: Understand the system goals, architecture, and current repository status.
2. **Read `/harness/agent-instructions.md`**: Review this protocol and your behavioral bounds.
3. **Identify Affected Business Rules**: Cross-reference the requested change with:
   - `/harness/business-rules.md`
   - `/harness/auction-rules.md`
   - `/harness/payment-rules.md`
   - `/harness/scheduling-rules.md`
   - `/harness/ad-delivery-rules.md`
   - `/harness/security-rules.md`
   - `/harness/database-contracts.md`
4. **Read the Relevant Rule Files**: Deep-dive into the specific rules governing your scope.
5. **Inspect Existing Implementation**: Check the actual source files, database definitions, and types before writing replacement code.
6. **Make the Smallest Safe Change**: Avoid speculative rewrites, architectural churn, or unrequested refactoring. Preserve backwards compatibility.
7. **Add / Update Executable Tests**: Any logic alteration must be accompanied or verified by tests in `/harness/evals/*`.
8. **Run Tests**: Execute `npm run test` (Vitest) and verify 100% pass rate across all evaluation suites.
9. **Run Type Checking & Linting**: Execute `npm run lint` (`tsc --noEmit`) to verify zero type regressions.
10. **Run Production Build**: Execute `npm run build` to confirm bundling succeeds cleanly.

---

## 2. The Golden Rule: Zero Silent Rule Changes

**The AI agent must NEVER silently change, weaken, bypass, or reinterpret a business rule.**

If a user prompt, stakeholder request, or third-party requirement directly or indirectly conflicts with any harness rule (e.g., asking to allow ₹0 bids, bypass payment verification, allow 30-second or overlapping ad slots, or trust client-side payment status):

### Mandatory Conflict Halt Routine

1. **STOP IMMEDIATELY**. Do not write or commit code that violates the rule.
2. **Explain the Conflict Explicitly to the User** using the following four-point report:
   - **Conflicting Rule**: Identify the exact rule ID (e.g., `AUCTION-001`, `PAYMENT-002`, `SCHED-001`).
   - **Reason for Conflict**: Explain why the proposed feature violates platform integrity, auction fairness, or financial reconciliation.
   - **Affected Code & Database Assets**: Specify which components, database tables, or server routes would be compromised.
   - **Rule Amendment Required**: Clarify what explicit change to the business contract would be required.
3. **Wait for Explicit Approval**: Proceed with the rule change ONLY after the user gives explicit, unambiguous written approval to modify that specific business rule.

---

## 3. Strict Prohibitions

1. **No Client Authority**: Never move bidding calculations, auction timer expiry authority, payment status resolution, or winner assignment to client-side components.
2. **No Mock Fallbacks in Critical Flows**: Do not replace real server validations with `return true` or dummy responses that subvert security.
3. **No Unauthenticated Access to Administrative Tools**: Admin controls must remain strictly gated behind authenticated role checks (`role === 'admin'`).
4. **No Financial Collusion**: Never create automatic bid-placing loops or artificial bots that bid without explicit user intent and funds.
5. **No Slot Overlaps**: Never schedule an ad slot that collides with another scheduled ad slot.
