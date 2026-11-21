import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, getAddress } from "ethers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const ADDRESSES = {
  unicrow: "0x32fab9f28724c1c5832d5d6830afe498f8abdaac",
  dispute: "0xdb2076dcecc82ed0dd204bf7b6db a44f0fea9e36".replace(/ /g, ""),
  arbitrator: "0xad8d43ddefaf2779f72340627a81b9f31330c3dd",
  claim: "0x01d612617028f14db6c6f4c00b2a9b4107a90f7a",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

const ABI = {
  unicrow: [
    "function unicrowDispute() view returns (address)",
    "function unicrowArbitrator() view returns (address)",
    "function unicrowClaim() view returns (address)",
    "function escrowIdCounter() view returns (uint256)",
    "function protocolFee() view returns (uint256)",
    "function governanceAddress() view returns (address)",
  ],
  dispute: [
    "function unicrow() view returns (address)",
    "function unicrowArbitrator() view returns (address)",
    "function unicrowClaim() view returns (address)",
  ],
  arbitrator: [
    "function unicrow() view returns (address)",
    "function unicrowClaim() view returns (address)",
  ],
  claim: [
    "function unicrow() view returns (address)",
    "function unicrowArbitrator() view returns (address)",
  ],
  erc20: [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function name() view returns (string)",
  ],
} as const;

function sameAddress(actual: string, expected: string) {
  try {
    return getAddress(actual) === getAddress(expected);
  } catch {
    return false;
  }
}

export async function GET() {
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, {
    staticNetwork: true,
  });

  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      return NextResponse.json(
        { ok: false, error: "WRONG_CHAIN", expected: String(CHAIN_ID), actual: network.chainId.toString(), transactionSent: false },
        { status: 503 },
      );
    }

    const codeEntries = await Promise.all(
      Object.entries(ADDRESSES).map(async ([name, address]) => {
        const code = await provider.getCode(address);
        return [name, { address, deployed: code !== "0x", bytecodeBytes: code === "0x" ? 0 : (code.length - 2) / 2 }] as const;
      }),
    );
    const code = Object.fromEntries(codeEntries) as Record<string, { address: string; deployed: boolean; bytecodeBytes: number }>;
    const missing = Object.entries(code).filter(([, value]) => !value.deployed).map(([name]) => name);
    if (missing.length) {
      return NextResponse.json({ ok: false, chainId: network.chainId.toString(), code, missing, transactionSent: false }, { status: 503 });
    }

    const contracts = {
      unicrow: new Contract(ADDRESSES.unicrow, ABI.unicrow, provider),
      dispute: new Contract(ADDRESSES.dispute, ABI.dispute, provider),
      arbitrator: new Contract(ADDRESSES.arbitrator, ABI.arbitrator, provider),
      claim: new Contract(ADDRESSES.claim, ABI.claim, provider),
      usdc: new Contract(ADDRESSES.usdc, ABI.erc20, provider),
    };

    const [
      unicrowDispute, unicrowArbitrator, unicrowClaim,
      disputeUnicrow, disputeArbitrator, disputeClaim,
      arbitratorUnicrow, arbitratorClaim,
      claimUnicrow, claimArbitrator,
      tokenSymbol, tokenDecimals, tokenName,
      escrowIdCounter, protocolFee, governanceAddress,
    ] = await Promise.all([
      contracts.unicrow.unicrowDispute(),
      contracts.unicrow.unicrowArbitrator(),
      contracts.unicrow.unicrowClaim(),
      contracts.dispute.unicrow(),
      contracts.dispute.unicrowArbitrator(),
      contracts.dispute.unicrowClaim(),
      contracts.arbitrator.unicrow(),
      contracts.arbitrator.unicrowClaim(),
      contracts.claim.unicrow(),
      contracts.claim.unicrowArbitrator(),
      contracts.usdc.symbol(),
      contracts.usdc.decimals(),
      contracts.usdc.name(),
      contracts.unicrow.escrowIdCounter(),
      contracts.unicrow.protocolFee(),
      contracts.unicrow.governanceAddress(),
    ]);

    const links = [
      { check: "unicrow.dispute", actual: unicrowDispute, expected: ADDRESSES.dispute },
      { check: "unicrow.arbitrator", actual: unicrowArbitrator, expected: ADDRESSES.arbitrator },
      { check: "unicrow.claim", actual: unicrowClaim, expected: ADDRESSES.claim },
      { check: "dispute.unicrow", actual: disputeUnicrow, expected: ADDRESSES.unicrow },
      { check: "dispute.arbitrator", actual: disputeArbitrator, expected: ADDRESSES.arbitrator },
      { check: "dispute.claim", actual: disputeClaim, expected: ADDRESSES.claim },
      { check: "arbitrator.unicrow", actual: arbitratorUnicrow, expected: ADDRESSES.unicrow },
      { check: "arbitrator.claim", actual: arbitratorClaim, expected: ADDRESSES.claim },
      { check: "claim.unicrow", actual: claimUnicrow, expected: ADDRESSES.unicrow },
      { check: "claim.arbitrator", actual: claimArbitrator, expected: ADDRESSES.arbitrator },
    ].map((item) => ({ ...item, passed: sameAddress(String(item.actual), item.expected) }));

    const tokenPassed = String(tokenSymbol) === "USDC" && Number(tokenDecimals) === 6;
    const linksPassed = links.every((item) => item.passed);

    return NextResponse.json({
      ok: linksPassed && tokenPassed,
      mode: "read-only",
      transactionSent: false,
      network: { name: "Base Sepolia", chainId: network.chainId.toString(), rpc: RPC },
      contracts: code,
      contractLinks: links,
      usdc: { address: ADDRESSES.usdc, name: String(tokenName), symbol: String(tokenSymbol), decimals: Number(tokenDecimals), passed: tokenPassed },
      unicrow: { escrowIdCounter: escrowIdCounter.toString(), protocolFee: protocolFee.toString(), governanceAddress: String(governanceAddress) },
      limitations: [
        "Bytecode presence and successful view calls do not prove verified source code or protocol security.",
        "No escrow was created, funded, released, or claimed by this read-only check.",
        "A full lifecycle test requires wallet-signed testnet transactions and test USDC.",
      ],
    }, { status: linksPassed && tokenPassed ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      mode: "read-only",
      transactionSent: false,
      error: error instanceof Error ? error.message : "RPC_READ_FAILED",
    }, { status: 503 });
  } finally {
    await provider.destroy();
  }
}
