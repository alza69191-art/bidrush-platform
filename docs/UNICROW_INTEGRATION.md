# BidRush × Unicrow integration plan

Status: TESTNET ONLY — no production payments.

## Repository baseline reviewed
- Next.js 15 App Router + TypeScript; MySQL/TiDB persistence.
- Existing escrow scaffolding is created by `ensureAdminSchema()` in `lib/admin-schema.ts`.
- Existing records include `escrow_settings`, `escrow_transactions`, `escrow_events`, and `escrow_disputes`.
- Awarding a bid currently creates an internal `awaiting_funding` record only. It does not create an on-chain escrow.
- Accepting a submission currently marks the task completed in the database only. It does not release funds on-chain.
- Current award route hardcodes `commissionBps = 0`; this must later be replaced by a validated admin setting, while remaining 0 during test-only rollout.

## Network
- Base Sepolia chain ID: **84532**.
- Base mainnet chain ID: **8453**.
- Do not use 8453 for Base Sepolia. The public Unicrow SDK README currently lists 8453 for both Base and Base Sepolia, which appears to be a documentation typo; verify the installed SDK's network map and Unicrow's published deployment before any transaction.
- SDK package: `@unicrowio/sdk`.
- Official SDK repository: https://github.com/unicrowio/sdk
- Official SDK documentation: https://docs.unicrow.io/docs/devs/sdk/

## Planned transaction lifecycle
1. Client chooses the winning bid; create a pending escrow record.
2. Browser connects to the client's injected EVM wallet (Rabby is acceptable only if the SDK detects its EIP-1193 provider correctly).
3. Client signs the Unicrow payment/escrow transaction on Base Sepolia.
4. Server records the returned escrow ID and transaction hash only after validating the submitted values and confirming the chain transaction.
5. Freelancer submits work; this is an application event and does not release funds.
6. Client accepts: buyer release action is signed by the buyer wallet; otherwise the seller can claim only after the challenge period ends, according to Unicrow contract rules.
7. Disputes are tracked in BidRush and routed to the configured arbitrator. Do not promise that an admin can reverse an on-chain transaction.
8. Refunds and resolutions are recorded only after the corresponding on-chain transaction is confirmed.

## Fee policy for initial test phase
- Marketplace fee: 0%.
- Arbitrator fee: 0% until an arbitrator and fee schedule are deliberately configured.
- Unicrow protocol fee: separate from BidRush fees; do not assume a live percentage from an old whitepaper. Verify the deployed contract's current configuration before production.
- No real funds, no production chain, and no automatic fee collection during this phase.
- Platform commission percentage remains unset/configurable for later; never infer a rate.

## Security and correctness requirements
- Never collect or store seed phrases or private keys. Rabby signs transactions locally.
- Never put wallet secrets, private keys, or RPC credentials in browser code or Git.
- Treat browser-provided escrow IDs and transaction hashes as untrusted until chain-verified.
- Use server-side authorization and idempotency for every state transition.
- Store chain ID, contract/escrow reference, tx hashes, token address, token decimals, amounts in base units, and confirmation status.
- Keep an append-only event history; reconcile pending transactions against chain state.
- A database status is not proof of escrow funding, release, or refund.
- Gate all payment actions behind an explicit test-mode feature flag until end-to-end tests pass.

## Implementation sequence
1. Verify Unicrow SDK version, supported chain IDs, Rabby provider detection, and official deployed contract addresses.
2. Add a testnet-only wallet connection and payment initiation UI.
3. Add server endpoints to create pending records and verify on-chain receipts before status changes.
4. Implement release, seller claim, refund, and dispute status reconciliation.
5. Add admin read-only monitoring and fee configuration with strict bounds.
6. Run end-to-end tests on Base Sepolia before considering any production deployment.
