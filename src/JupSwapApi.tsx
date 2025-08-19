import {
  VersionedTransaction,
  Connection,
  TransactionInstruction,
  PublicKey,
  TransactionMessage,
  Transaction,
} from "@solana/web3.js";
import { toast } from "sonner";


interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  maxAccounts?: number,
  onlyDirectRoutes?: boolean,
}

interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  outAmount: string;
}

interface InstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface Instruction {
  programId: string;
  accounts: InstructionAccount[];
  data: string;
}


const baseUrl: string = "https://quote-api.jup.ag/v6";

export const getQuote = async (params: QuoteParams): Promise<QuoteResponse> => {
  try {
    const url = new URL(`https://quote-api.jup.ag/v6/quote?`);
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
    // You can add restrictIntermediateTokens for more stable routes
    //url.searchParams.append("restrictIntermediateTokens", "true");

    const response = await fetch(url.toString());
    if (!response.ok) {
      toast.error("Failed to get quote!");
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: QuoteResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching quote:", error);
    throw error;
  }
}

export const getSwapTransactionVersioned = async (quoteResponse: QuoteResponse, publicKey: PublicKey): Promise<VersionedTransaction> => {

  const { swapTransaction } = await (
    await fetch('https://quote-api.jup.ag/v6/swap', {
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
        // feeAccount: "fee_account_public_key"
      })
    })
  ).json();

  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  var transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf.buffer));
  return transaction;
}

interface SwapInstructions {
  setupInstrutions: TransactionInstruction[],
  swapInstruction: TransactionInstruction,
  cleanupInstruction: TransactionInstruction,
}

export const getSwapInstructions = async (quoteResponse: QuoteResponse, pubKey: PublicKey): Promise<SwapInstructions> => {
  console.log(quoteResponse);
  const instructions = await (
    await fetch(`${baseUrl}/swap-instructions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: pubKey.toBase58(),
      })
    })
  ).json();
  console.log(instructions);
  if (instructions.error) {
    throw new Error("Failed to get swap instructions: " + instructions.error);
  }

  const {
    setupInstructions, // Setup missing ATA for the users.
    swapInstruction: swapInstructionPayload, // The actual swap instruction.
    cleanupInstruction, // The lookup table addresses that you can use if you are using versioned transaction.
  } = instructions;


  return {
    setupInstrutions: [setupInstructions.map(deserializeInstruction)],
    swapInstruction: deserializeInstruction(swapInstructionPayload),
    cleanupInstruction: deserializeInstruction(cleanupInstruction),
  }
}



export const getSwapTransaction = async (quoteParams: QuoteParams, connection: Connection, pubKey: PublicKey): Promise<Transaction | VersionedTransaction> => {
  const quoteResponse = await getQuote(quoteParams);
  const instructions = await (
    await fetch(`${baseUrl}/swap-instructions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: pubKey.toBase58(),
        dynamicComputeUnitLimit: true,
      })
    })
  ).json();
  console.log(instructions);
  if (instructions.error) {
    throw new Error("Failed to get swap instructions: " + instructions.error);
  }

  const {
    setupInstructions, // Setup missing ATA for the users.
    swapInstruction: swapInstructionPayload, // The actual swap instruction.
    cleanupInstruction, // The lookup table addresses that you can use if you are using versioned transaction.
  } = instructions;



  // const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

  // addressLookupTableAccounts.push(
  //   ...(await getAddressLookupTableAccounts(connection, addressLookupTableAddresses))
  // );



  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const messageV0 = new TransactionMessage({
    payerKey: pubKey,
    recentBlockhash: blockhash,
    instructions: [
      ...setupInstructions.map(deserializeInstruction),
      deserializeInstruction(swapInstructionPayload),
      deserializeInstruction(cleanupInstruction),
    ],
  }).compileToLegacyMessage();

  const transaction = Transaction.populate(messageV0);
  return transaction;
}

const deserializeInstruction = (instruction: Instruction) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

