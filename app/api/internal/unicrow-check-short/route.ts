import { NextResponse } from "next/server";

const RPC_URL = "https://sepolia.base.org";
const CONTRACTS = [
  ["unicrow", "0x32fab9f28724c1c5832d5d6830afe498f8abdaac"],
  ["dispute", "0xdb2076dcecc82ed0dd204bf7b6db"],
  ["arbitrator", "0xad8d43ddefaf2779f72340627a81b9f31330c3dd"],
  ["claim", "0x01d612617028f14db6c6f4c00b2a9b4107a90f7a"],
] as const;

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("RPC HTTP " + response.status);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC error");
  return payload.result as string;
}

export async function GET() {
  try {
    const chainId = await rpc("eth_chainId", []);
    if (chainId !== "0x14a34") {
      return new Response("NETWORK_MISMATCH\nchainId=" + chainId + "\nexpected=0x14a34\n", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const lines = ["BIDRUSH UNICROW CONTRACT CHECK", "network=Base Sepolia", "chainId=" + chainId, "mode=read-only", "transactionsSent=false"];
    for (const [name, address] of CONTRACTS) {
      const code = await rpc("eth_getCode", [address, "latest"]);
      const deployed = code !== "0x" && code.length > 2;
      const bytecodeBytes = deployed ? (code.length - 2) / 2 : 0;
      lines.push(name + ": " + (deployed ? "DEPLOYED" : "NOT_DEPLOYED") + " | bytes=" + bytecodeBytes + " | address=" + address);
    }
    lines.push("NOTE=Bytecode presence does not prove source verification, ABI compatibility, or protocol safety.");
    return new Response(lines.join("\n") + "\n", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RPC error";
    return new Response("CHECK_FAILED\nerror=" + message + "\ntransactionsSent=false\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
