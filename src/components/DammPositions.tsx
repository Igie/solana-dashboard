import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wallet, ExternalLink, Droplets, TrendingUp, ChevronDown, ChevronUp, Menu } from 'lucide-react'
import { SortType, useDammUserPositions } from '../contexts/DammUserPositionsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
import { toast } from 'sonner'
import { BN, } from '@coral-xyz/anchor'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { PublicKey, Transaction, TransactionInstruction, TransactionMessage, type AccountMeta } from '@solana/web3.js'
import { copyToClipboard, getPoolPositionFromPublicKeys, getSchedulerType, getShortMintS, renderFeeTokenImages, type PoolPositionInfo } from '../constants'
import { useCpAmm } from '../contexts/CpAmmContext'
import { AuthorityType, createSetAuthorityInstruction, getMint, NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { unwrapSOLInstruction } from '@meteora-ag/cp-amm-sdk'
import { txToast } from './Simple/TxToast'
import { launchpads } from './launchpads/Launchpads'
import { DepositPopover } from './Simple/Dammv2DepositPopover'
import * as splToken from "@solana/spl-token"
import Decimal from "decimal.js"
import { decode } from '@coral-xyz/anchor/dist/cjs/utils/bytes/bs58'

interface PnlInfo {
  instructionChange:
  {
    instruction: string,
    tokenAChange: number,
    tokenBChange: number,
  }[],

  tokenAAdded: number,
  tokenBAdded: number,
  tokenARemoved: number,
  tokenBRemoved: number,

  positionValueA: number,
  positionValueB: number,

  claimedFeesA: number,
  claimedFeesB: number,
  pnlA: number,
  pnlB: number,
  pnlAPercent: number,
  pnlBPercent: number,
}

const DammPositions: React.FC = () => {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  const { sendTxn, sendMultiTxn } = useTransactionManager()
  const { cpAmm, coder } = useCpAmm();
  const { positions, totalLiquidityValue, loading, refreshPositions, updatePosition, removePosition, sortPositionsBy, removeLiquidityAndSwapToQuote, sortedBy, sortedAscending } = useDammUserPositions();
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [lastSelectedPosition, setLastSelectedPosition] = useState<PoolPositionInfo | null>(null);

  const [pnlIndex, setPnlIndex] = useState<number | undefined>(undefined);
  const [pnlInfo, setPnlInfo] = useState<PnlInfo | undefined>(undefined);

  const [searchString, setSearchString] = useState<string>("");

  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [closePositionRange, setClosePositionRange] = useState(100);

  const [sendPositionsRecipient, setSendPositionsRecipient] = useState("");
  const [sendPositionsDropdownOpen, setSendPositionsDropdownOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null)
  const pnlRef = useRef<HTMLDivElement | null>(null)

  const toggleRowExpand = (index: string) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleClaimFees = async (position: PoolPositionInfo) => {
    if (position.positionUnclaimedFee <= 0) return;

    const txn = await cpAmm.claimPositionFee2({
      receiver: publicKey!,
      owner: publicKey!,
      feePayer: publicKey!,
      pool: position.poolInfo.publicKey,
      position: position.positionAddress,
      positionNftAccount: position.positionNftAccount,
      tokenAMint: position.poolInfo.account.tokenAMint,
      tokenBMint: position.poolInfo.account.tokenBMint,
      tokenAProgram: new PublicKey(position.tokenA.tokenProgram),
      tokenBProgram: new PublicKey(position.tokenB.tokenProgram),
      tokenAVault: position.poolInfo.account.tokenAVault,
      tokenBVault: position.poolInfo.account.tokenBVault,
    })

    try {
      await sendTxn(txn.instructions, 0, undefined, undefined, {
        notify: true,
        onSuccess: () => {
          updatePosition(position.positionAddress);
        }
      })

    } catch (e) {
      console.log(e);
    }
  }

  const getClaimFeesTx = async (positions: PoolPositionInfo[]) => {
    const ixs = [];
    positions = positions.filter(x => x.positionUnclaimedFee > 0);

    while (positions.length > 0) {
      const innerPositions = positions.splice(0, 4)
      const t = new Transaction();

      let unwrapSol = false;

      const atas: TransactionInstruction[] = [];
      const claims: TransactionInstruction[] = [];

      for (const pos of innerPositions) {

        const tokenAProgram = new PublicKey(pos.tokenA.tokenProgram)
        const tokenBProgram = new PublicKey(pos.tokenB.tokenProgram)
        const txn = await cpAmm.claimPositionFee2({
          receiver: publicKey!,
          owner: publicKey!,
          feePayer: publicKey!,
          pool: pos.poolInfo.publicKey,
          position: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          tokenAMint: pos.poolInfo.account.tokenAMint,
          tokenBMint: pos.poolInfo.account.tokenBMint,
          tokenAProgram: tokenAProgram,
          tokenBProgram: tokenBProgram,
          tokenAVault: pos.poolInfo.account.tokenAVault,
          tokenBVault: pos.poolInfo.account.tokenBVault,
        })

        if (pos.poolInfo.account.tokenAMint.equals(NATIVE_MINT) || pos.poolInfo.account.tokenBMint.equals(NATIVE_MINT)) {
          unwrapSol = true;
          txn.instructions.pop();
        }

        const claimIx = txn.instructions.pop();
        claims.push(claimIx!);

        if (txn.instructions.length > 0) atas.push(...txn.instructions);
      }

      t.instructions.push(...atas, ...claims);

      if (unwrapSol) t.instructions.push(await unwrapSOLInstruction(publicKey!, publicKey!, true));


      ixs.push(t.instructions);
    }
    return ixs;
  };

  const handleClosePosition = async (position: PoolPositionInfo) => {
    if (cpAmm.isLockedPosition(position.positionState)) {
      toast.error("Cannot close a locked position");
      return;
    }

    let txn = await cpAmm.removeAllLiquidityAndClosePosition({
      owner: publicKey!,
      position: position.positionAddress,
      positionNftAccount: position.positionNftAccount,
      positionState: position.positionState,
      poolState: position.poolInfo.account,
      tokenAAmountThreshold: new BN(0),
      tokenBAmountThreshold: new BN(0),
      vestings: [],
      currentPoint: new BN(0),
    });

    try {
      await sendTxn(txn.instructions, 10000, undefined, undefined, {
        notify: true,
        onSuccess: () => {
          removePosition(position.positionAddress);
          if (expandedIndex)
            setExpandedIndex(null);
        }
      })
    } catch (e) {
      console.log(e);
    }
  };

  const getClosePositionTx = async (positions: PoolPositionInfo[], amount: number) => {

    if (amount < 100)
      return await getRemoveLiquidityTx(positions, amount);

    const ixs = [];
    positions = positions.filter(x => !cpAmm.isLockedPosition(x.positionState))
    while (positions.length > 0) {
      const innerPositions = positions.splice(0, 1);
      const index = positions.findIndex(x => innerPositions[0].tokenA.mint === x.tokenA.mint ||
        innerPositions[0].tokenA.mint === x.tokenB.mint ||
        innerPositions[0].tokenB.mint === x.tokenA.mint ||
        innerPositions[0].tokenB.mint === x.tokenB.mint)
      if (index > -1)
        innerPositions.push(...positions.splice(index, 1));

      const t = new Transaction();
      for (const pos of innerPositions) {
        const txn = await cpAmm.removeAllLiquidityAndClosePosition({
          owner: publicKey!,
          position: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          positionState: pos.positionState,
          poolState: pos.poolInfo.account,
          tokenAAmountThreshold: new BN(0),
          tokenBAmountThreshold: new BN(0),
          vestings: [],
          currentPoint: new BN(0),
        });
        t.add(...txn.instructions);
      }
      ixs.push(t.instructions);
    }
    return ixs;
  };

  const getRemoveLiquidityTx = async (positions: PoolPositionInfo[], amount: number) => {
    const ixs = [];
    positions = positions.filter(x => !cpAmm.isLockedPosition(x.positionState))

    let epoch = 0;

    const poolStates = [...positions.map(x => x.tokenA.tokenProgram), positions.map(x => x.tokenB.tokenProgram)]
    if (poolStates.indexOf(TOKEN_2022_PROGRAM_ID.toBase58()))
      epoch = (await connection.getEpochInfo("confirmed")).epoch;

    while (positions.length > 0) {
      const innerPositions = positions.splice(0, 2)
      const t = new Transaction();
      for (const pos of innerPositions) {

        const tokenAProgram = new PublicKey(pos.tokenA.tokenProgram);
        const tokenBProgram = new PublicKey(pos.tokenB.tokenProgram);
        const tokenInfoA = pos.tokenA.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58() ?
          {
            mint: await getMint(connection,
              new PublicKey(pos.tokenA.mint),
              connection.commitment,
              tokenAProgram,
            ),
            currentEpoch: epoch
          } : undefined

        const tokenInfoB = pos.tokenB.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58() ?
          {
            mint: await getMint(connection,
              new PublicKey(pos.tokenB.mint),
              connection.commitment,
              tokenBProgram,
            ),
            currentEpoch: epoch
          } : undefined

        const withdrawQuote = cpAmm.getWithdrawQuote({
          liquidityDelta: pos.positionState.unlockedLiquidity.muln(amount).divn(100),
          sqrtPrice: pos.poolInfo.account.sqrtPrice,
          maxSqrtPrice: pos.poolInfo.account.sqrtMaxPrice,
          minSqrtPrice: pos.poolInfo.account.sqrtMinPrice,

          tokenATokenInfo: tokenInfoA,
          tokenBTokenInfo: tokenInfoB,
        })

        const txn = await cpAmm.removeLiquidity({
          owner: publicKey!,
          pool: pos.poolInfo.publicKey,
          position: pos.positionAddress,
          positionNftAccount: pos.positionNftAccount,
          liquidityDelta: withdrawQuote.liquidityDelta,
          tokenAMint: pos.poolInfo.account.tokenAMint,
          tokenBMint: pos.poolInfo.account.tokenBMint,
          tokenAVault: pos.poolInfo.account.tokenAVault,
          tokenBVault: pos.poolInfo.account.tokenBVault,
          tokenAProgram,
          tokenBProgram,
          tokenAAmountThreshold: new BN(0),
          tokenBAmountThreshold: new BN(0),
          vestings: [],
          currentPoint: new BN(0),
        });
        t.add(...txn.instructions);
      }
      ixs.push(t.instructions)
    }
    return ixs;
  };

  const handleClosePositionAndSwap = async (position: PoolPositionInfo) => {
    if (cpAmm.isLockedPosition(position.positionState)) {
      toast.error("Cannot close a locked position");
      return;
    }
    removeLiquidityAndSwapToQuote(position);
  }

  const getSendPositionTx = async (positions: PoolPositionInfo[], recipient: PublicKey) => {

    const ixs: TransactionInstruction[][] = [];
    if (positions.length == 0) return ixs;

    while (positions.length > 0) {
      const innerPositions = positions.splice(0, 14)

      const t = new Transaction();
      for (const pos of innerPositions) {
        t.add(
          createSetAuthorityInstruction(
            pos.positionNftAccount,
            publicKey!,
            AuthorityType.AccountOwner,
            recipient,
            [],
            TOKEN_2022_PROGRAM_ID
          )
        )
      }
      ixs.push(t.instructions)
    };
    return ixs;
  }

  const calculatePnl = async (position: PoolPositionInfo) => {
    let signatures = await connection.getSignaturesForAddress(position.positionNftAccount);
    signatures = signatures.filter(x => x.err === null);
    console.log(signatures.length);
    if (signatures.length === 0) {
      toast.error("No signatures returned.");
      return;
    }
    let transactions = await connection.getTransactions(signatures.map(x => x.signature),
      {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    transactions = transactions.filter(x => x !== null);
    transactions.reverse();

    const pnlInfo: PnlInfo = {
      instructionChange: [],

      tokenAAdded: 0,
      tokenBAdded: 0,
      tokenARemoved: 0,
      tokenBRemoved: 0,

      positionValueA: position.tokenA.positionAmount,
      positionValueB: position.tokenB.positionAmount,
      claimedFeesA: 0,
      claimedFeesB: 0,
      pnlA: 0,
      pnlB: 0,
      pnlAPercent: 0,
      pnlBPercent: 0,
    }

    for (const tx of transactions) {
      if (!tx) continue;
      console.log("new transaction");
      console.log(tx);
      const message = TransactionMessage.decompile(tx.transaction.message)

      let i = -1;
      for (const ix of message.instructions) {
        i++;
        if (ix.programId.equals(cpAmm._program.programId)) {
          //console.log(ix)

          const decoded = coder!.instruction.decode(ix.data, "base58")
          const formatted = coder!.instruction.format(decoded!, ix.keys);


          const posNftAccount = formatted?.accounts.find(x => x.name === "Position Nft Account")
          //console.log(formatted)
          if (!posNftAccount || !posNftAccount.pubkey.equals(position.positionNftAccount)) {
            console.log("wrong position nft", posNftAccount);
            console.log("required", position.positionNftAccount.toBase58());
            continue;
          }
          if (decoded && formatted) {
            console.log("===")
            console.log(decoded.name)

            if (decoded.name === "initializeCustomizablePool") {
              const inner = tx.meta?.innerInstructions!.find(x => x.index === i)

              const keysA: AccountMeta[] = inner?.instructions[inner!.instructions.length - 3].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const keysB: AccountMeta[] = inner?.instructions[inner!.instructions.length - 2].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const transactionA = new TransactionInstruction({
                keys: keysA,
                data: decode(inner!.instructions[inner!.instructions.length - 3].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[inner!.instructions.length - 3].programIdIndex],
              })
              console.log("token A program:", transactionA.programId.toBase58())

              const transactionB = new TransactionInstruction({
                keys: keysB,
                data: decode(inner!.instructions[inner!.instructions.length - 2].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[inner!.instructions.length - 2].programIdIndex],
              })
              console.log("token B program:", transactionB.programId.toBase58())

              const tokenAIx = splToken.decodeTransferCheckedInstruction(transactionA, transactionA.programId);
              const tokenBIx = splToken.decodeTransferCheckedInstruction(transactionB, transactionB.programId);

              const tokenAChange = -new Decimal(tokenAIx.data.amount.toString()).div(Decimal.pow(10, tokenAIx.data.decimals)).toNumber();
              const tokenBChange = -new Decimal(tokenBIx.data.amount.toString()).div(Decimal.pow(10, tokenBIx.data.decimals)).toNumber();

              pnlInfo.instructionChange.push({
                instruction: decoded.name,
                tokenAChange: tokenAChange,
                tokenBChange: tokenBChange,
              })

              pnlInfo.tokenAAdded += -tokenAChange;
              pnlInfo.tokenBAdded += -tokenBChange;
            }

            if (decoded.name === "initializePool") {
              const inner = tx.meta?.innerInstructions!.find(x => x.index === i)

              const keysA: AccountMeta[] = inner?.instructions[inner!.instructions.length - 3].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const keysB: AccountMeta[] = inner?.instructions[inner!.instructions.length - 2].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const transactionA = new TransactionInstruction({
                keys: keysA,
                data: decode(inner!.instructions[inner!.instructions.length - 3].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[inner!.instructions.length - 3].programIdIndex],
              })
              console.log("token A program:", transactionA.programId.toBase58())

              const transactionB = new TransactionInstruction({
                keys: keysB,
                data: decode(inner!.instructions[inner!.instructions.length - 2].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[inner!.instructions.length - 2].programIdIndex],
              })
              console.log("token B program:", transactionB.programId.toBase58())

              const tokenAIx = splToken.decodeTransferCheckedInstruction(transactionA, transactionA.programId);
              const tokenBIx = splToken.decodeTransferCheckedInstruction(transactionB, transactionB.programId);

              const tokenAChange = -new Decimal(tokenAIx.data.amount.toString()).div(Decimal.pow(10, tokenAIx.data.decimals)).toNumber();
              const tokenBChange = -new Decimal(tokenBIx.data.amount.toString()).div(Decimal.pow(10, tokenBIx.data.decimals)).toNumber();

              pnlInfo.instructionChange.push({
                instruction: decoded.name,
                tokenAChange: tokenAChange,
                tokenBChange: tokenBChange,
              })

              pnlInfo.tokenAAdded += -tokenAChange;
              pnlInfo.tokenBAdded += -tokenBChange;
            }

            //console.log("formatted", formatted)
            if (decoded.name === "addLiquidity") {
              const inner = tx.meta?.innerInstructions!.find(x => x.index === i)

              const keysA: AccountMeta[] = inner?.instructions[0].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const keysB: AccountMeta[] = inner?.instructions[1].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const transactionA = new TransactionInstruction({
                keys: keysA,
                data: decode(inner!.instructions[0].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[0].programIdIndex],
              })
              console.log("token A program:", transactionA.programId.toBase58())
              const transactionB = new TransactionInstruction({
                keys: keysB,
                data: decode(inner!.instructions[1].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[1].programIdIndex],
              })
              console.log("token B program:", transactionB.programId.toBase58())
              const test = splToken.decodeInstruction(transactionA, transactionA.programId);
              console.log("test", test);
              const tokenAIx = splToken.decodeTransferCheckedInstruction(transactionA, transactionA.programId);
              const tokenBIx = splToken.decodeTransferCheckedInstruction(transactionB, transactionB.programId);

              const tokenAChange = -new Decimal(tokenAIx.data.amount.toString()).div(Decimal.pow(10, tokenAIx.data.decimals)).toNumber();
              const tokenBChange = -new Decimal(tokenBIx.data.amount.toString()).div(Decimal.pow(10, tokenBIx.data.decimals)).toNumber();

              pnlInfo.instructionChange.push({
                instruction: decoded.name,
                tokenAChange: tokenAChange,
                tokenBChange: tokenBChange,
              })

              pnlInfo.tokenAAdded += -tokenAChange;
              pnlInfo.tokenBAdded += -tokenBChange;
            }

            if (decoded.name === "claimPositionFee") {
              const inner = tx.meta?.innerInstructions!.find(x => x.index === i)
              let tokenAFee = 0;
              let tokenBFee = 0;
              if (inner!.instructions.length >= 2) {
                const keysB: AccountMeta[] = inner!.instructions[0].accounts.map(x => {
                  return {
                    pubkey: tx.transaction.message.staticAccountKeys[x],
                    isSigner: tx.transaction.message.isAccountSigner(x),
                    isWritable: tx.transaction.message.isAccountWritable(x),
                  }
                })!;

                const transactionB = new TransactionInstruction({
                  keys: keysB,
                  data: decode(inner!.instructions[0].data),
                  programId: tx.transaction.message.staticAccountKeys[inner!.instructions[0].programIdIndex],
                })
                console.log("token B program:", transactionB.programId.toBase58())

                const tokenBIx = splToken.decodeTransferCheckedInstruction(transactionB, transactionB.programId);
                tokenBFee = new Decimal(tokenBIx.data.amount.toString()).div(Decimal.pow(10, tokenBIx.data.decimals)).toNumber();
              }
              let tokenAIx = null;
              if (inner!.instructions.length >= 3) {

                const keysA: AccountMeta[] = inner?.instructions[1].accounts.map(x => {
                  return {
                    pubkey: tx.transaction.message.staticAccountKeys[x],
                    isSigner: tx.transaction.message.isAccountSigner(x),
                    isWritable: tx.transaction.message.isAccountWritable(x),
                  }
                })!;
                const transactionA = new TransactionInstruction({
                  keys: keysA,
                  data: decode(inner!.instructions[1].data),
                  programId: tx.transaction.message.staticAccountKeys[inner!.instructions[1].programIdIndex],
                })
                console.log("token A program:", transactionA.programId.toBase58())

                tokenAIx = splToken.decodeTransferCheckedInstruction(transactionA, transactionA.programId);
                tokenAFee = new Decimal(tokenAIx.data.amount.toString()).div(Decimal.pow(10, tokenAIx.data.decimals)).toNumber();
              }
              pnlInfo.instructionChange.push({
                instruction: decoded.name,
                tokenAChange: tokenAFee,
                tokenBChange: tokenBFee
              })

              pnlInfo.claimedFeesA += tokenAFee;
              pnlInfo.claimedFeesB += tokenBFee;
              pnlInfo.tokenARemoved += tokenAFee;
              pnlInfo.tokenBRemoved += tokenBFee;

            }

            if (decoded.name === "removeLiquidity") {
              const inner = tx.meta?.innerInstructions!.find(x => x.index === i)

              const keysA: AccountMeta[] = inner?.instructions[0].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const keysB: AccountMeta[] = inner?.instructions[1].accounts.map(x => {
                return {
                  pubkey: tx.transaction.message.staticAccountKeys[x],
                  isSigner: tx.transaction.message.isAccountSigner(x),
                  isWritable: tx.transaction.message.isAccountWritable(x),
                }
              })!;

              const transactionA = new TransactionInstruction({
                keys: keysA,
                data: decode(inner!.instructions[0].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[0].programIdIndex],
              })

              const transactionB = new TransactionInstruction({
                keys: keysB,
                data: decode(inner!.instructions[1].data),
                programId: tx.transaction.message.staticAccountKeys[inner!.instructions[1].programIdIndex],
              })

              const tokenAIx = splToken.decodeTransferCheckedInstruction(transactionA, transactionA.programId);
              const tokenBIx = splToken.decodeTransferCheckedInstruction(transactionB, transactionB.programId);

              const tokenAChange = new Decimal(tokenAIx.data.amount.toString()).div(Decimal.pow(10, tokenAIx.data.decimals)).toNumber();
              const tokenBChange = new Decimal(tokenBIx.data.amount.toString()).div(Decimal.pow(10, tokenBIx.data.decimals)).toNumber();
              pnlInfo.instructionChange.push({
                instruction: decoded.name,
                tokenAChange: tokenAChange,
                tokenBChange: tokenBChange,
              });
              pnlInfo.tokenARemoved += tokenAChange;
              pnlInfo.tokenBRemoved += tokenBChange;
            }
          }
        }
      }

      pnlInfo.pnlAPercent = (pnlInfo.tokenARemoved + position.tokenA.positionAmount + position.tokenA.unclaimedFee) / pnlInfo.tokenAAdded * 100 - 100;
      pnlInfo.pnlBPercent = (pnlInfo.tokenBRemoved + position.tokenB.positionAmount + position.tokenB.unclaimedFee) / pnlInfo.tokenBAdded * 100 - 100;
      pnlInfo.pnlA = (pnlInfo.tokenARemoved + position.tokenA.positionAmount + position.tokenA.unclaimedFee) - pnlInfo.tokenAAdded
      pnlInfo.pnlB = (pnlInfo.tokenBRemoved + position.tokenB.positionAmount + position.tokenB.unclaimedFee) - pnlInfo.tokenBAdded
      //pnlInfo.transactionPnl.push(instructionsPnl);
    }
    //const metdata = await fetchTokenMetadataJup([NATIVE_MINT.toBase58()]);

    setPnlInfo(pnlInfo);
    console.log(pnlInfo);
  }

  const poolContainsString = (pool: PoolPositionInfo, searchString: string): boolean => {
    const lowerSearch = searchString.toLowerCase();
    return pool.tokenA.name.toLowerCase().includes(lowerSearch) ||
      pool.tokenA.symbol.toLowerCase().includes(lowerSearch) ||
      pool.tokenA.mint === searchString ||
      pool.tokenB.name.toLowerCase().includes(lowerSearch) ||
      pool.tokenB.symbol.toLowerCase().includes(lowerSearch) ||
      pool.tokenB.mint === lowerSearch;
  }

  useEffect(() => {
    refreshPositions();
    setSelectedPositions(new Set());
  }, [connection, publicKey])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowSortMenu(false)
      }
      if (pnlRef.current && !pnlRef.current.contains(event.target as Node)) {
        setPnlIndex(undefined);
        setPnlInfo(undefined);
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSort = (sortType: SortType, ascending?: boolean) => {

    sortPositionsBy(sortType, ascending);
    setShowSortMenu(false);
  };

  if (!connected) {
    return (
      <div className="text-center py-12 px-4">
        <Wallet className="w-16 h-16 mx-auto mb-6 text-gray-400" />
        <h2 className="text-2xl font-bold mb-4 text-gray-300">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6 px-4">Connect your Solana wallet to view your DAMMv2 pool positions</p>
        <UnifiedWalletButton buttonClassName="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !font-medium !px-8 !py-3" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-110px)] lg:h-[calc(100vh-55px)] space-y-1 px-2 md:px-0">
      {/* Pool Overview Stats */}
      <div className="grid grid-cols-2 gap-0.5">
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded px-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-blue-300">Liquidity</h4>
            <Droplets className="w-5 h-5 text-blue-400" />
          </div>
          <div className="font-bold text-white">
            ${totalLiquidityValue.toFixed(2)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded px-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-purple-300">Pools</h4>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <div className="font-bold text-white">
            {positions.length}
          </div>
        </div>
      </div>

      {/* Search Bar */}

      <input
        className="w-full bg-gray-800 border border-gray-600 px-2 py-0.5 text-xs rounded-lg text-white placeholder-gray-400"
        type="text"
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
        placeholder="Search by token mint, name or symbol..."
      />
      <div className="flex flex-row items-start justify-between gap-1">
        <div className="flex items-stretch justify-start md:gap-1 gap-0.5">
          <div className="flex flex-col justify-end gap-1">
            <button
              onClick={() => {
                refreshPositions()
                setSelectedPositions(new Set())
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded text-md transition-colors w-auto justify-center"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
            <button
              onClick={() => {
                setSelectedPositions(new Set([...positions.map(x => x.positionAddress.toBase58())]))
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded text-md transition-colors w-auto justify-center"
            >
              Select All
            </button>
          </div>
          <div className="flex flex-col justify-end gap-1">
            <button
              onClick={() => {
                setSelectedPositions(new Set())
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded text-md transition-colors w-auto justify-center"
            >
              Deselect All
            </button>
          </div>
        </div>
        {/* Sort Menu */}
        <div className="relative md:text-md text-sm">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-white w-auto justify-center"
          >
            <Menu className="w-4 h-4" />
            Sort
            {showSortMenu ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-6 bg-gray-800 border border-gray-600 rounded-lg p-2 z-10 min-w-56 shadow-lg">
              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Pool TVL</div>
              <button
                onClick={() => handleSort(SortType.PoolValue, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolValue && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolValue, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolValue && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium">Position Value</div>
              <button
                onClick={() => handleSort(SortType.PositionValue, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionValue && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PositionValue, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionValue && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Unclaimed Fees</div>
              <button
                onClick={() => handleSort(SortType.PositionUnclaimedFee, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionUnclaimedFee && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PositionUnclaimedFee, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionUnclaimedFee && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Claimed Fees</div>
              <button
                onClick={() => handleSort(SortType.PositionClaimedFee, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionClaimedFee && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PositionClaimedFee, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PositionClaimedFee && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Current Fee</div>
              <button
                onClick={() => handleSort(SortType.PoolCurrentFee, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolCurrentFee && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolCurrentFee, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolCurrentFee && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>
              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Base Fee</div>
              <button
                onClick={() => handleSort(SortType.PoolBaseFee, false)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolBaseFee && sortedAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolBaseFee, true)}
                className={`block w-full text-left px-3 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortedBy === SortType.PoolBaseFee && sortedAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Total Fees Summary */}
      {positions.length > 0 && (
        <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-1">
          <div className="sm:flex-row items-start sm:items-center justify-between gap-1">
            <div className="px-2 text-green-300">
              <span className="text-sm font-semibold">
                Total Fees: ${positions.reduce((sum, pos) => sum + pos.positionUnclaimedFee, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between px-2 w-full sm:w-auto">
              <div className="flex gap-0.5">
                <button
                  className="bg-blue-600 hover:bg-blue-500 px-2 md:py-1 rounded text-white flex-1 sm:flex-none"
                  onClick={async () => {
                    const selectedPositionsTemp = [...selectedPositions];

                    const ixs = await getClaimFeesTx(getPoolPositionFromPublicKeys(positions, selectedPositionsTemp));

                    setSelectedPositions(new Set());

                    if (ixs.length > 0)
                      await sendMultiTxn(ixs.map(x => {
                        return {
                          ixs: x,
                        }
                      }), 0, undefined,
                        {
                          onSuccess: async () => {
                            await refreshPositions();
                          }
                        })
                  }
                  }
                >
                  Claim Fees ({selectedPositions.size})
                </button>
                <div className="flex">
                  <button
                    className="bg-blue-600 hover:bg-blue-500 px-2 md:py-1 rounded text-white flex-1 sm:flex-none"
                    onClick={async () => {
                      if (selectedPositions.size > 0)
                        setSendPositionsDropdownOpen(!sendPositionsDropdownOpen)
                    }}
                  >

                    Send ({selectedPositions.size})
                  </button>
                  {sendPositionsDropdownOpen && (
                    <div className="absolute z-50 mt-15 max-h-200 overflow-y-auto bg-gray-800 border border-gray-700 placeholder-gray-500 rounded-md shadow-lg">
                      <input type='text'
                        placeholder='Enter wallet address...'
                        value={sendPositionsRecipient}
                        onChange={e => { setSendPositionsRecipient(e.target.value.trim()) }}
                      >
                      </input>
                      <button
                        className="bg-blue-600 hover:bg-blue-500 px-2 md:py-1 rounded text-white flex-1 sm:flex-none"
                        onClick={async () => {
                          const selectedPositionsTemp = [...selectedPositions];

                          let recipient: PublicKey;
                          try {

                            recipient = new PublicKey(sendPositionsRecipient);
                          } catch {
                            console.error("failed to get send recipient!");
                            txToast.error("Failed to find recipient!");
                            return;
                          }
                          const ixs = await getSendPositionTx(getPoolPositionFromPublicKeys(positions, selectedPositionsTemp), recipient)
                          setSelectedPositions(new Set());
                          setSendPositionsDropdownOpen(false);
                          if (ixs.length > 0)
                            await sendMultiTxn(ixs.map(x => {
                              return {
                                ixs: x,
                              }
                            }), 0, undefined, {
                              onSuccess: async () => {
                                await refreshPositions();
                              }
                            })
                        }}
                      >
                        Submit
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className='flex md:flex-row flex-col gap-0.5'>
                <div className="flex flex-col">
                  <button
                    className="bg-purple-600 hover:bg-purple-500 px-2 md:py-0.5 rounded text-white flex-1 sm:flex-none"
                    onClick={async () => {
                      try {
                        const selectedPositionsTemp = [...selectedPositions];
                        const ixs = await getClosePositionTx(getPoolPositionFromPublicKeys(positions, selectedPositionsTemp), closePositionRange)
                        setSelectedPositions(new Set());

                        if (ixs.length > 0)
                          await sendMultiTxn(ixs.map(x => {
                            return {
                              ixs: x,
                            }
                          }), 10000, undefined, {
                            onSuccess: async () => {
                              await refreshPositions();
                            }
                          })
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >
                    {closePositionRange < 100 ? "Remove Liquidity" : "Close Position"} ({selectedPositions.size})
                  </button>
                  <div className="flex gap-1">
                    <input id='closePositionRangeId' type='range' min={10} max={100} step={10}
                      onInput={e => {
                        if (e.currentTarget.nextElementSibling)
                          e.currentTarget.nextElementSibling.innerHTML = e.currentTarget.value + '%'
                      }}

                      defaultValue={100}
                      onMouseUp={e => setClosePositionRange(parseFloat(e.currentTarget.value))}
                      onTouchEnd={e => setClosePositionRange(parseFloat(e.currentTarget.value))}
                    >
                    </input>
                    <div className='min-w-10'>{closePositionRange + "%"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {(positions.length === 0 && !loading) ? (
        <div className="p-8 text-center">
          <Droplets className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No Pool Positions Found</h3>
          <p className="text-gray-500 px-4">
            You don't have any active liquidity positions in DAMMv2 pools
          </p>
        </div>
      ) : (
        <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          {/* Desktop Table Header - Sticky */}
          <div className="hidden md:block bg-gray-800 border-b border-gray-600 sticky top-0 pr-4">
            <div className="grid grid-cols-12 divide-x divide-gray-700 gap-2 px-4 py-1 text-xs font-medium text-gray-300 uppercase tracking-wider">
              <div className="col-span-1"></div>
              <div className="col-span-2">Pair</div>
              <div className="col-span-2">Your Liquidity</div>
              <div className="col-span-3">Claimable/Claimed</div>
              <div className="col-span-2">Scheduler</div>
              <div className="col-span-2">Fees</div>
            </div>
          </div>
          {/* Scrollable Content */}
          <div className="flex-grow overflow-y-auto">
            {positions.filter((x) => poolContainsString(x, searchString)).map((position, index) => (
              <div key={index}>
                {/* Desktop Table Row */}
                <div className="hidden md:grid grid-cols-12 divide-x divide-gray-700 gap-2 px-4 py-1 border-b border-gray-700 hover:bg-gray-800/50 items-center">
                  {/* Checkbox */}
                  <div className="flex gap-2 justify-center col-span-1">
                    <input
                      type="checkbox"
                      className="scale-125 accent-purple-600"
                      checked={selectedPositions.has(position.positionAddress.toBase58())}
                      onChange={(e) => {
                        if (lastSelectedPosition !== null && (e.nativeEvent as MouseEvent).shiftKey) {
                          const index1 = positions.indexOf(position);
                          const index2 = positions.indexOf(lastSelectedPosition);
                          const addedRange = positions.slice(Math.min(index1, index2), Math.max(index1, index2) + 1);
                          setSelectedPositions(new Set([...selectedPositions, ...addedRange.map(x => x.positionAddress.toBase58())]));
                          setLastSelectedPosition(position);
                          return;
                        }
                        setLastSelectedPosition(position);
                        if (e.target.checked) {
                          setSelectedPositions(new Set(selectedPositions.add(position.positionAddress.toBase58())));
                        }
                        if (!e.target.checked) {
                          setSelectedPositions(new Set<string>(Array.from(selectedPositions).filter(x => x !== position.positionAddress.toBase58())));
                        }
                      }}
                    />
                    <button
                      onClick={() => toggleRowExpand(position.positionAddress.toBase58())}
                      className="p-1 rounded hover:bg-gray-700 transition-colors"
                    >
                      {expandedIndex === position.positionAddress.toBase58() ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    {positions.filter(x => x.tokenA.mint === position.tokenA.mint).length >= 2 ?
                      (<button
                        onClick={() => {
                          if (searchString === position.tokenA.mint)
                            setSearchString("")
                          else
                            setSearchString(position.tokenA.mint);
                        }}
                        className="rounded bg-red-950 hover:bg-red-800 items-center justify-center transition-colors"
                      >
                        <div className="w-4 h-4 text-white font-medium text-xs">{positions.filter(x => x.tokenA.mint === position.tokenA.mint).length}</div>
                      </button>)
                      : <div className="w-4 h-4" />}

                  </div>
                  {/* Token Pair */}
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                          {position.tokenA.image ? (
                            <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-[10px]">
                              {position.tokenA.symbol.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                          {position.tokenB.image ? (
                            <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[10px]">
                              {position.tokenB.symbol.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="w-6 h-6 px-2 flex items-center object-scale-down">
                          {
                            (() => {
                              if (!position.tokenA.launchpad) return "";
                              const launchpad = launchpads[position.tokenA.launchpad];
                              if (launchpad) {
                                const Logo = launchpads[position.tokenA.launchpad].logo || null;
                                if (!Logo) return "";
                                return <Logo />;
                              } else console.log(position.tokenA.launchpad, position.tokenA.mint)
                              return "";
                            })()
                          }
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm">
                          <button
                            onClick={() => copyToClipboard(position.tokenA.mint)}
                            className="hover:text-purple-400 transition-colors"
                            title="Copy mint address"
                          >
                            {position.tokenA.symbol}
                          </button>
                          <span className="text-gray-500">/</span>
                          <button
                            onClick={() => copyToClipboard(position.tokenB.mint)}
                            className="hover:text-purple-400 transition-colors"
                            title="Copy mint address"
                          >
                            {position.tokenB.symbol}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Your Liquidity */}
                  <div className="grid col-span-2">
                    <div className="flex text-md">
                      <div className="text-white font-medium">{`$${position.positionValue.toFixed(2)} / $${position.poolValue.toFixed(2)}`}</div>
                    </div>
                    <div className="text-xs text-gray-400">
                      ({position.shareOfPoolPercentage.toFixed(2)}%)
                    </div>

                  </div>

                  {/* Claimable/Claimed Fees */}
                  <div className="grid col-span-3">
                    <div className="flex items-center gap-2">
                      {/* Token Images */}
                      {renderFeeTokenImages(position)}

                      {/* Fees row */}
                      <div className="grid grid-cols-3 gap-2 text-sm min-w-[120px]">
                        {/* Unclaimed */}
                        {position.positionUnclaimedFee > 0 ? (
                          <span className="text-green-400 min-w-[60px] font-medium">
                            ${position.positionUnclaimedFee.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-500 min-w-[60px]">-</span>
                        )}

                        {/* Claimed */}
                        {position.positionClaimedFee > 0 ? (
                          <span className="text-green-700 min-w-[60px] font-medium">
                            ${position.positionClaimedFee.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-500 min-w-[60px]">-</span>
                        )}

                        {/* PnL */}
                        <div className="relative">
                          <button className="bg-green-600 hover:bg-green-500 px-0.5 rounded-xs text-white"
                            onClick={() => {
                              calculatePnl(position);
                              setPnlIndex(index)
                            }}
                          >
                            PnL
                          </button>
                          {pnlIndex === index && pnlInfo !== undefined && (
                            <div key={index}
                              ref={pnlRef}
                              className="absolute flex flex-col z-50 top-6 left-0 w-80 bg-gray-900 text-gray-100 border border-gray-700 rounded-xs p-2 text-xs">
                              <div>{position.tokenA.symbol + " / " + position.tokenB.symbol}</div>
                              <div className="flex gap-1 w-max">
                                <button
                                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-0.5 px-1 rounded-xs flex items-center gap-1"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(position.tokenA.mint);
                                  }}
                                >
                                  <div className="flex gap-1 items-center justify-center">
                                    <span>{getShortMintS(position.tokenA.mint)}</span>
                                  </div>
                                </button>
                                <button
                                  disabled={!connected}
                                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-0.5 px-1 rounded-xs flex items-center gap-1"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(position.tokenB.mint);
                                  }}
                                >
                                  <div className="flex gap-1 items-center justify-center">
                                    <span>{getShortMintS(position.tokenB.mint)}</span>
                                  </div>
                                </button>
                              </div>
                              <div className="flex flex-col divide-y divide-gray-700">
                                {pnlInfo!.instructionChange.map(x => (
                                  <div className="flex flex-col">
                                    <div className="text-blue-500">
                                      {x.instruction}
                                    </div>
                                    <div className={`${x.tokenBChange > 0 ? "text-green-500" : "text-red-500"}`}>
                                      {(x.tokenAChange === 0 ? "" : x.tokenAChange.toFixed(4) + ' ' + position.tokenA.symbol + " and ") + x.tokenBChange.toFixed(4) + ' ' + position.tokenB.symbol}
                                    </div>

                                    <div>
                                      {/* {`SOL: ${x.solPnl > 0 ? "+" : ""}${x.solPnl}`} */}
                                    </div>
                                  </div>

                                ))}
                              </div>
                              <div className=''>
                                <div className="text-red-600 border-t border-t-gray-700">
                                  {"Sent " + position.tokenA.symbol + ": " + pnlInfo.tokenAAdded.toFixed(4)}
                                </div>
                                <div className="text-red-600 border-b border-b-gray-700 ">
                                  {"Sent " + position.tokenB.symbol + ": " + pnlInfo.tokenBAdded.toFixed(4)}
                                </div>
                                <div className="text-green-600">
                                  {"Received " + position.tokenA.symbol + ": " + pnlInfo.tokenARemoved.toFixed(4)}
                                </div>
                                <div className="text-green-600 border-b border-b-gray-700">
                                  {"Received " + position.tokenB.symbol + ": " + pnlInfo.tokenBRemoved.toFixed(4)}
                                </div>
                                <div className="text-green-600">
                                  {"Claimable " + position.tokenA.symbol + ": " + position.tokenA.unclaimedFee.toFixed(4)}
                                </div>
                                <div className="text-green-600 border-b border-b-gray-700">
                                  {"Claimable " + position.tokenB.symbol + ": " + position.tokenB.unclaimedFee.toFixed(4)}
                                </div>
                                <div className="text-blue-600">
                                  {"Position " + position.tokenA.symbol + ": " + pnlInfo.positionValueA.toFixed(4)}
                                </div>
                                <div className="text-blue-600 border-b border-b-gray-700">
                                  {"Position " + position.tokenB.symbol + ": " + pnlInfo.positionValueB.toFixed(4)}
                                </div>
                                <div className="flex flex-col text-green-700">
                                  <div>{`${position.tokenA.symbol} PNL: ${pnlInfo.pnlAPercent.toFixed(2)} %`}</div>
                                  <div>{`${pnlInfo.pnlA >= 0 ? '+' : ''}${pnlInfo.pnlA.toFixed(4)} ${position.tokenA.symbol}`}</div>
                                </div>
                                <div className="flex flex-col text-green-700">
                                  <div>{`${position.tokenB.symbol} PNL: ${pnlInfo.pnlBPercent.toFixed(2)} %`}</div>
                                  <div>{`${pnlInfo.pnlB >= 0 ? '+' : ''}${pnlInfo.pnlB.toFixed(4)} ${position.tokenB.symbol}`}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scheduler */}
                  <div className="col-span-2">
                    <div className="text-white text-sm">
                      {getSchedulerType(position.poolInfo.account.poolFees.baseFee.feeSchedulerMode)}
                    </div>
                  </div>

                  {/* Current/Base Fees */}
                  <div className="col-span-2">
                    <div className="text-white text-sm">
                      {(position.poolCurrentFeeBPS / 100).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      Base: {(position.poolBaseFeeBPS / 100).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="md:hidden border-b border-gray-700">
                  <div className="p-2">
                    {/* Header Row with Checkbox and Token Pair */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="scale-125 accent-purple-600"
                          checked={selectedPositions.has(position.positionAddress.toBase58())}
                          onChange={(e) => {
                            if (lastSelectedPosition !== null && (e.nativeEvent as MouseEvent).shiftKey) {
                              const index1 = positions.indexOf(position);
                              const index2 = positions.indexOf(lastSelectedPosition);
                              const addedRange = positions.slice(Math.min(index1, index2), Math.max(index1, index2) + 1);
                              setSelectedPositions(new Set([...selectedPositions, ...addedRange.map(x => x.positionAddress.toBase58())]));
                              setLastSelectedPosition(position);
                              return;
                            }
                            setLastSelectedPosition(position);
                            if (e.target.checked) {
                              setSelectedPositions(new Set(selectedPositions.add(position.positionAddress.toBase58())));
                            }
                            if (!e.target.checked) {
                              setSelectedPositions(new Set<string>(Array.from(selectedPositions).filter(x => x !== position.positionAddress.toBase58())));
                            }
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                              {position.tokenA.image ? (
                                <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
                                  {position.tokenA.symbol.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                              {position.tokenB.image ? (
                                <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                                  {position.tokenB.symbol.slice(0, 2)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(position.tokenA.mint)}
                              className="text-white hover:text-purple-400 transition-colors font-medium"
                              title="Copy mint address"
                            >
                              {position.tokenA.symbol}
                            </button>
                            <span className="text-gray-500">/</span>
                            <button
                              onClick={() => copyToClipboard(position.tokenB.mint)}
                              className="text-white hover:text-purple-400 transition-colors font-medium"
                              title="Copy mint address"
                            >
                              {position.tokenB.symbol}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleRowExpand(position.positionAddress.toBase58())}
                        className="p-2 rounded hover:bg-gray-700 transition-colors"
                      >
                        {expandedIndex == position.positionAddress.toBase58() ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>

                    {/* Mobile Info Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Your Liquidity</div>
                        <div className="text-white font-medium">${position.positionValue.toFixed(2)}</div>
                        <div className="text-xs text-gray-400">({position.shareOfPoolPercentage.toFixed(2)}%)</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Fees</div>
                        <div className="text-white text-sm">{(position.poolCurrentFeeBPS / 100).toFixed(2)}%</div>
                        <div className="text-xs text-gray-400">Base: {(position.poolBaseFeeBPS / 100).toFixed(2)}%</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Claimable</div>
                        {position.positionUnclaimedFee > 0 ? (
                          <div className="flex items-center gap-2">
                            {renderFeeTokenImages(position)}
                            <div className="text-green-400 font-medium text-sm">
                              ${position.positionUnclaimedFee.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm">-</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Scheduler</div>
                        <div className="text-white text-sm">
                          {getSchedulerType(position.poolInfo.account.poolFees.baseFee.feeSchedulerMode)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Panel (Same for both desktop and mobile) */}
                {expandedIndex == position.positionAddress.toBase58() && (
                  <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
                    {/* Pool + Token Links */}
                    <div className="space-y-6">
                      {/* Pool Links */}
                      <div className='md:flex md:flex-row gap-2'>
                        <div className='flex items-start gap-2'>
                          <div className='flex flex-col'>
                            <div className='flex grow justify-between items-stretch text-nowrap gap-2'>
                              <div className="flex flex-col grow space-y-0.5">
                                <h4 className="text-white font-medium mb-2 text-sm">Pool Analytics</h4>
                                <a
                                  href={`https://edge.meteora.ag/dammv2/${position.poolInfo.publicKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                                >
                                  Meteora Pool <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={`https://dexscreener.com/solana/${position.poolInfo.publicKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                                >
                                  DexScreener <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={`https://axiom.trade/meme/${position.poolInfo.publicKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                                >
                                  Axiom Chart <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={`https://www.dextools.io/app/en/solana/pair-explorer/${position.poolInfo.publicKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                                >
                                  DEXTools Chart <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <div className="flex flex-col grow space-y-0.5">
                                <h4 className="text-white font-medium mb-2 text-sm">Token Analytics</h4>
                                <a
                                  href={`https://gmgn.ai/sol/token/NQhHUcmQ_${position.tokenA.mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                                >
                                  {position.tokenA.symbol} on GMGN <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={`https://gmgn.ai/sol/token/NQhHUcmQ_${position.tokenB.mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                                >
                                  {position.tokenB.symbol} on GMGN <ExternalLink className="w-3 h-3" />
                                </a>
                                <div className="y-1" />
                                <a
                                  href={`https://axiom.trade/t/${position.tokenA.mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                                >
                                  {position.tokenA.symbol} on AXIOM <ExternalLink className="w-3 h-3" />
                                </a>
                                <a
                                  href={`https://axiom.trade/t/${position.tokenB.mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                                >
                                  {position.tokenB.symbol} on AXIOM <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                            {/* Actions */}
                            <div className="relative">
                              <h4 className="text-white font-medium mb-2 text-sm">Actions</h4>
                              <div className="space-y-2">
                                {position.positionUnclaimedFee > 0 && (
                                  <button
                                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded"
                                    onClick={() => handleClaimFees(position)}
                                  >
                                    Claim Fees
                                  </button>
                                )}
                                <button
                                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2 rounded"
                                  onClick={() => handleClosePosition(position)}
                                >
                                  Close Position
                                </button>
                                <button
                                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2 rounded"
                                  onClick={() => handleClosePositionAndSwap(position)}
                                >
                                  Close and Swap Position
                                </button>
                                <DepositPopover
                                  className={"flex flex-col grow bg-[#0d111c] text-gray-100 border border-gray-700 rounded-sm p-1 gap-1 text-sm justify-center"}
                                  owner={publicKey!}
                                  onClose={() => { }}
                                  poolInfo={position.poolInfo}
                                  positionInfo={position}
                                >
                                </DepositPopover>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className='flex w-full min-h-120 items-stretch justify-stretch'>

                          <iframe
                            src={`https://www.gmgn.cc/kline/sol/${position.tokenA.mint}`}
                            className="w-full h-full rounded border border-gray-700"
                          />

                        </div>
                      </div>
                    </div>
                    {/* GMGN Pool Chart */}

                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DammPositions