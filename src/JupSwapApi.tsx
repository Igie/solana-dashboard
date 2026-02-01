import {
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import { toast } from "sonner";
import Decimal from "decimal.js";


interface JupiterUltraParams {
  inputMint: string;
  outputMint: string;
  amount: Decimal;
  taker: string;
  excludeDexes?: string[];
  devFee?: number;
}

interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: Decimal;
  slippageBps: number;
  maxAccounts?: number;
  onlyDirectRoutes?: boolean;
  excludeDexes?: string[];
  devFee?: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: JupiterRoutePlan[];
  contextSlot: number;
  timeTaken: number;
  swapUsdValue: string;
  simplerRouteUsed: boolean;
  mostReliableAmmsQuoteReport: {
    info: Record<string, string>;
  };
  useIncurredSlippageForQuoting: any;
  otherRoutePlans: any;
  aggregatorVersion: any;
}

export interface JupiterRoutePlan {
  swapInfo: any;
  percent: number;
  bps: number;
}

export const getQuote = async (params: JupiterQuoteParams, notify: boolean = true): Promise<JupiterQuoteResponse> => {
  try {    
    const url = new URL(window.location.origin + `/api/jupiter/quote?`);
    console.log(url);
    url.searchParams.append("inputMint", params.inputMint);
    url.searchParams.append("outputMint", params.outputMint);
    url.searchParams.append("amount", params.amount.toString());
    url.searchParams.append("slippageBps", params.slippageBps.toString());
    url.searchParams.append("dynamicComputeUnitLimit", "true");
    //url.searchParams.append("asLegacyTransaction", "true");
    if (params.maxAccounts)
      url.searchParams.append("maxAccounts", params.maxAccounts.toString());
    if (params.onlyDirectRoutes)
      url.searchParams.append("onlyDirectRoutes", params.onlyDirectRoutes.toString());
    if (params.excludeDexes && params.excludeDexes.length > 0)
      url.searchParams.append("excludeDexes", params.excludeDexes.join(","));
    if (params.devFee && params.devFee > 0) {
      url.searchParams.append("platformFeeBps", (params.devFee * 100).toString());
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      if (notify) {
        toast.error("Failed to get quote!");
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: JupiterQuoteResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching quote:", error);
    throw error;
  }
}

export const getSwapTransactionVersioned = async (quoteResponse: JupiterQuoteResponse, publicKey: PublicKey): Promise<VersionedTransaction> => {
  const { swapTransaction } = await (
    await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        // Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
        feeAccount: quoteResponse.platformFee ? "4RRpiiuXCAofvsuqxFKVtyvR2bGUupUFL4nkWQZBHp4e" : undefined,
      })
    })
  ).json();

  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  var transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf.buffer));
  return transaction;
}

interface JupiterUltraResponse {
  transaction: string | null
  requestId: string,
}
export const getUltraOrder = async (params: JupiterUltraParams, notify: boolean = true) => {
  try {
    const url = new URL(`https://lite-api.jup.ag/ultra/v1/order?`);
    url.searchParams.append("inputMint", params.inputMint);
    url.searchParams.append("outputMint", params.outputMint);
    url.searchParams.append("amount", params.amount.toString());
    url.searchParams.append("taker", params.taker.toString());
    //url.searchParams.append("asLegacyTransaction", "true");

    if (params.excludeDexes && params.excludeDexes.length > 0)
      url.searchParams.append("excludeDexes", params.excludeDexes.join(","));

    const response = await fetch(url.toString());
    if (!response.ok) {
      if (notify) {
        toast.error("Failed to get quote!");
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: JupiterUltraResponse = await response.json();
    console.log("Ultra response", data);
    return data;
  } catch (error) {
    console.error("Error fetching quote:", error);
    throw error;
  }
}



