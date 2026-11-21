# BidRush × Unicrow integration plan

Status: TESTNET ONLY — no production payments.

## Repository baseline
- Next.js 15 App Router + TypeScript; MySQL/TiDB persistence.
- Existing escrow scaffolding is created by `ensureAdminSchema()` in `lib/admin-schema.ts`.
- Awarding a bid creates an internal `awaiting_funding` record only. It does not create an on-chain escrow.
- Accepting a submission currently marks the task completed in the database only. It does not release funds on-chain.

## Selected test network: Base Sepolia
- Chain ID: `84532`.
- The current official SDK source file `src/config/setup.ts` explicitly includes Base Sepolia and its contract addresses: https://github.com/unicrowio/sdk/blob/main/src/config/setup.ts
- Unicrow contract addresses currently listed in that SDK source:
  - Unicrow: `0x32fab9f28724c1c5832d5d6830afe498f8abdaac`
  - Dispute: `0xdb2076dcecc82ed0dd204bf7b6dba44f0fea9e36`
  - Arbitrator: `0xad8d43ddefaf2779f72340627a81b9f31330c3dd`
  - Claim: `0x01d612617028f14db6c6f4c00b2a9b4107a90f7a`
- Circle USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals). Source: https://www.circle.com/multi-chain-usdc/base
- Important: the SDK README currently repeats chain ID 8453 for Base Sepolia, but the actual SDK source lists the correct chain ID 84532 and a Base Sepolia deployment. Use the source configuration, not the README typo.
- Base mainnet (8453) is not enabled for this integration. No production funds or mainnet transactions.

Official SDK: https://github.com/unicrowio/sdk
SDK package: `@unicrowio/sdk` (source package version observed: 1.2.1)
SDK docs: https://docs.unicrow.io/docs/devs/sdk/

## Current implementation stage
- `/wallet-test` reads the connected EIP-1193 wallet address and chain ID.
- It can request a switch to Base Sepolia (84532).
- It never asks for seed phrases/private keys and does not send transactions.
- This is a connectivity smoke test, not an escrow integration.

## Planned transaction lifecycle
1. Client selects the winning bid; create a pending escrow record.
2. Client wallet signs Unicrow escrow/payment transaction.
3. Server stores the escrow reference and transaction hash only after validating the values and confirming the chain transaction.
4. Freelancer submits work; this is an application event and does not release funds.
5. Client accepts: buyer release action is signed by buyer wallet; otherwise seller claim follows Unicrow challenge-period rules.
6. Disputes are routed to the configured arbitrator; BidRush admin cannot reverse immutable on-chain transactions.
7. Refund and arbitration states are recorded only after the matching on-chain transaction is confirmed.

## Initial fee policy
- BidRush marketplace fee: 0% during testing.
- Arbitrator fee: 0% until arbitrator and fee schedule are deliberately configured.
- Unicrow protocol fee is separate; read it from the deployed contract using the SDK. Do not assume a live percentage from an old whitepaper.
- No real funds, no production chain, and no automatic fee collection.
- Production commission remains unset until deliberately configured.

## Security and correctness requirements
- Never collect or store seed phrases or private keys. Rabby signs locally.
- Never put wallet secrets, private keys, or privileged RPC credentials in browser code or Git.
- Treat browser-supplied escrow IDs and transaction hashes as untrusted until chain-verified.
- Server-side verification must check chain ID, official Unicrow contract address, receipt success, event signature, escrow ID, buyer, seller, token, amount, and payment reference.
- Use server-side authorization and idempotency for every state transition.
- Store chain ID, contract/escrow reference, tx hashes, token address, token decimals, amounts in base units, and confirmation status.
- Keep an append-only event history; reconcile pending transactions against chain state.
- A database status is not proof of escrow funding, release, or refund.
- Gate all payment actions behind an explicit test-mode feature flag until end-to-end tests pass.

## Test plan
- Wallet absent, locked, denied, disconnected, and unsupported-chain cases.
- Buyer and seller account authorization.
- Duplicate requests and idempotency.
- Underpayment, wrong token, wrong chain, reverted transaction, dropped transaction, and insufficient gas.
- Confirmations, reorg/reconciliation, and forged transaction hash attempts.
- Release, claim after challenge period, refund, dispute, arbitration, and duplicate webhook/event handling.
- Concurrent award/review actions and database rollback behavior.
