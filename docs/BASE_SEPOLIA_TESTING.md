# Base Sepolia test setup for BidRush

This environment is for testnet use only. Test ETH and test USDC have no real monetary value.

## Network
- Name: Base Sepolia
- Chain ID: 84532 (hex: 0x14a34)
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- Native gas token: test ETH

## Test tokens
- Circle USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Decimals: 6
- Circle faucet: https://faucet.circle.com/ (select Base Sepolia)
- Coinbase Developer Platform faucet: https://www.coinbase.com/developer-platform/products/faucet (supports Base Sepolia ETH and USDC)
- Alchemy Base Sepolia ETH faucet: https://www.alchemy.com/faucets/base-sepolia

Never send testnet tokens to a mainnet address or use mainnet assets for this test.

## Wallet smoke test
1. Open https://bidrush-web-production.up.railway.app/wallet-test
2. Select Connect Rabby.
3. Expected Chain ID: `0x14a34` (84532).
4. If the network is missing, use the switch button; the page can request adding Base Sepolia.
5. The page only reads the public wallet address and chain ID. It does not request a token approval or send a transaction.

Never share a recovery phrase, private key, or wallet password. A wallet whose recovery phrase was previously exposed must not be used for real funds.

## Unicrow test deployment
The official `@unicrowio/sdk` source configuration lists Base Sepolia (84532) and these addresses:
- Unicrow: `0x32fab9f28724c1c5832d5d6830afe498f8abdaac`
- Dispute: `0xdb2076dcecc82ed0dd204bf7b6dba44f0fea9e36`
- Arbitrator: `0xad8d43ddefaf2779f72340627a81b9f31330c3dd`
- Claim: `0x01d612617028f14db6c6f4c00b2a9b4107a90f7a`

Source: https://github.com/unicrowio/sdk/blob/main/src/config/setup.ts

These addresses are copied from the official SDK source. Before enabling payment calls, verify contract code and events against the Base Sepolia explorer and run a read-only chain check. No transaction should be sent until that check is complete.
