import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = "https://sepolia.base.org";
const EXPECTED_CHAIN_ID = "0x14a34";
const CONTRACTS = {
  unicrow: "0x32fab9f28724c1c5832d5d6830afe498f8abdaac",
  dispute: "0xdb2076dcecc82ed0dd204bf7b6dba44f0fea9e36",
  arbitrator: "0xad8d43ddefaf2779f72340627a81b9f31330c3dd",
  claim: "0x01d612617028f14db6c6f4c00b2a9b4107a90f7a",
} as const;

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error("RPC_REQUEST_FAILED");
  return payload.result as string;
}

export async function GET() {
  try {
    const chainId = await rpc("eth_chainId", []);
    if (chainId !== EXPECTED_CHAIN_ID) {
      return NextResponse.json(
        { status: "wrong_network", expectedChainId: EXPECTED_CHAIN_ID, actualChainId: chainId },
        { status: 502 }
      );
    }

    const contracts = await Promise.all(
      Object.entries(CONTRACTS).map(async ([name, address]) => {
        const code = await rpc("eth_getCode", [address, "latest"]);
        const deployed = typeof code === "string" && code !== "0x" && code.length > 2;
        return {
          name,
          address,
          deployed,
          bytecodeBytes: deployed ? (code.length - 2) / 2 : 0,
        };
      })
    );

    const allDeployed = contracts.every((contract) => contract.deployed);
    return NextResponse.json({
      status: allDeployed ? "contracts_present" : "contracts_missing",
      network: "Base Sepolia",
      chainId,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      transactionsSent: false,
      contracts,
      note: "Non-empty bytecode confirms code exists at the address; it does not by itself verify source code, ABI compatibility, or protocol safety.",
    });
  } catch {
    return NextResponse.json(
      { status: "rpc_unavailable", network: "Base Sepolia", readOnly: true, transactionsSent: false },
      { status: 503 }
    );
  }
}
