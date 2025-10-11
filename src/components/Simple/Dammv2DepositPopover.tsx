import React, { useEffect, useRef, useState } from 'react';
import { getTokenProgram, type DepositQuote } from '@meteora-ag/cp-amm-sdk';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { DecimalInput } from './DecimalInput';
import { BN } from '@coral-xyz/anchor';
import { useTokenAccounts, type TokenAccount } from '../../contexts/TokenAccountsContext';
import type { PoolInfo, PoolPositionInfo } from '../../constants';
import { useDammUserPositions } from '../../contexts/DammUserPositionsContext';
import { getQuote, getSwapTransactionVersioned } from '../../JupSwapApi';
import { getAssociatedTokenAddressSync, getMint, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, unpackAccount, type Mint } from '@solana/spl-token';
import { useTransactionManager } from '../../contexts/TransactionManagerContext';
import { txToast } from './TxToast';
import { useSettings } from '../../contexts/SettingsContext';
import { useConnection, useWallet } from '@jup-ag/wallet-adapter';
import { useCpAmm } from '../../contexts/CpAmmContext';
import { RefreshCw } from 'lucide-react';
import { useTokenMetadata } from '../../contexts/TokenMetadataContext';


interface DepositPopoverProps {
  owner: PublicKey,
  poolInfo: PoolInfo | null;
  positionInfo: PoolPositionInfo | null;
  onClose: () => void;
  className?: string;
}

export const DepositPopover: React.FC<DepositPopoverProps> = ({

  owner,
  poolInfo,
  positionInfo,
  onClose,
  className,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  const { jupSlippage, includeDammv2Route, setIncludeDammv2Route, swapSolDefaultAmount, devFee } = useSettings();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { cpAmm } = useCpAmm();
  const { sendTxn, sendVersionedTxn } = useTransactionManager();
  const { fetchTokenMetadata } = useTokenMetadata();
  const { solBalance, updateTokenAccounts } = useTokenAccounts();
  const { refreshPositions } = useDammUserPositions();

  const [loading, setLoading] = useState(false);

  const [amountA, setAmountA] = useState(new Decimal(0));
  const [amountB, setAmountB] = useState(new Decimal(0));

  const [tokenA, setTokenA] = useState<TokenAccount | undefined>(undefined);
  const [tokenB, setTokenB] = useState<TokenAccount | undefined>(undefined);

  const [depositQuote, setDepositQuote] = useState<DepositQuote>();

  const [swapSolAmount, setSwapSolAmount] = useState(new Decimal(swapSolDefaultAmount!));

  const [closePositionRange, setClosePositionRange] = useState(100);

  const tokenAInfo = useRef<{ mint: Mint, currentEpoch: number }>(undefined)
  const tokenBInfo = useRef<{ mint: Mint, currentEpoch: number }>(undefined)

  const setTokensAB = async () => {
    if (!poolInfo) return;
    setLoading(true)
    //const ta = await refreshTokenAccounts();
    try {
      const mintA = poolInfo.account.tokenAMint.toBase58();
      const mintB = poolInfo.account.tokenBMint.toBase58();

      const pubKeyA = getAssociatedTokenAddressSync(poolInfo.account.tokenAMint, publicKey!, false, getTokenProgram(poolInfo.account.tokenAFlag));
      const pubKeyB = getAssociatedTokenAddressSync(poolInfo.account.tokenBMint, publicKey!, false, getTokenProgram(poolInfo.account.tokenBFlag));

      console.log(mintA, mintB);
      console.log(pubKeyA.toBase58(), pubKeyB.toBase58());
      const [tas, meta] =
        await Promise.all([
          connection.getMultipleAccountsInfo([pubKeyA, pubKeyB], "confirmed"),
          fetchTokenMetadata([mintA, mintB])
        ])

      console.log(tas);

      const taA = tas[0] 
      ? unpackAccount(pubKeyA, tas[0], getTokenProgram(poolInfo.account.tokenAFlag)) 
      : undefined;
      const taB = tas[1] 
      ? unpackAccount(pubKeyB, tas[1], getTokenProgram(poolInfo.account.tokenBFlag)) 
      : undefined;

      console.log(pubKeyA.toBase58())
      console.log(pubKeyB.toBase58())
      console.log("taA", taA)
      console.log("taB", taB)
      const amountA = mintA === NATIVE_MINT.toBase58()
        ? new Decimal(taA ? taA.amount.toString() : 0).div(LAMPORTS_PER_SOL).add(solBalance)
        : new Decimal(taA ? taA.amount.toString() : 0).div(Decimal.pow(10, meta[mintA].decimals));

      const amountB = mintB === NATIVE_MINT.toBase58()
        ? new Decimal(taB ? taB.amount.toString() : 0).div(LAMPORTS_PER_SOL).add(solBalance)
        : new Decimal(taB ? taB.amount.toString() : 0).div(Decimal.pow(10, meta[mintB].decimals));

      const tokenAATA: TokenAccount | undefined = (taA === undefined &&  mintA !== NATIVE_MINT.toBase58()) 
      ? undefined 
      : {
        ...meta[mintA],
        amount: amountA,
        value: amountA.mul(meta[mintA].price),
        lamports: 0,
      }

      const tokenBATA: TokenAccount | undefined = (taB === undefined &&  mintB !== NATIVE_MINT.toBase58()) 
      ? undefined : {
        ...meta[mintB],
        amount: amountB,
        value: amountB.mul(meta[mintB].price),
        lamports: 0,
      }

      updateTokenAccounts([tokenAATA, tokenBATA]);

      let currentEpoch = 0;

      if (tokenAATA?.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58() ||
        tokenAATA?.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58())
        currentEpoch = (await connection.getEpochInfo()).epoch;

      if (tokenAATA?.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58())
        tokenAInfo.current = {
          mint: await getMint(connection,
            poolInfo.account.tokenAMint,
            connection.commitment,
            new PublicKey(tokenAATA?.tokenProgram)
          ),
          currentEpoch,
        }
      else
        tokenAInfo.current = undefined;

      if (tokenBATA?.tokenProgram == TOKEN_2022_PROGRAM_ID.toBase58())
        tokenBInfo.current = {
          mint: await getMint(connection,
            poolInfo.account.tokenBMint,
            connection.commitment,
            new PublicKey(tokenBATA?.tokenProgram)
          ),
          currentEpoch,
        }
      else
        tokenBInfo.current = undefined;

      setTokenA(tokenAATA)
      setTokenB(tokenBATA)
    }
    catch (e) {
      console.error(e);

    } finally {
      setLoading(false);
    }
  }

  const refreshPool = async () => {
    if (!poolInfo) return;
    poolInfo.account = await cpAmm.fetchPoolState(poolInfo.publicKey);
  }

  const getDepositAmountB = async (input: Decimal) => {
    if (!poolInfo) return;
    await refreshPool();
    if (!tokenA || !tokenB) return;

    const depositQuote = cpAmm.getDepositQuote({
      sqrtPrice: poolInfo.account.sqrtPrice,
      minSqrtPrice: poolInfo.account.sqrtMinPrice,
      maxSqrtPrice: poolInfo.account.sqrtMaxPrice,
      isTokenA: true,
      inputTokenInfo: tokenAInfo.current,
      outputTokenInfo: tokenBInfo.current,
      inAmount: new BN(input.mul(Decimal.pow(10, tokenA!.decimals)).toString()),
    })

    setDepositQuote(depositQuote);
    setAmountA(new Decimal(depositQuote.actualInputAmount.toString()).div(Decimal.pow(10, tokenA!.decimals)))
    setAmountB(new Decimal(depositQuote.outputAmount.toString()).div(Decimal.pow(10, tokenB!.decimals)))
  }

  const getDepositAmountA = async (input: Decimal) => {
    if (!poolInfo) return;
    await refreshPool();
    if (!tokenA || !tokenB) return;

    const depositQuote = cpAmm.getDepositQuote({
      sqrtPrice: poolInfo.account.sqrtPrice,
      minSqrtPrice: poolInfo.account.sqrtMinPrice,
      maxSqrtPrice: poolInfo.account.sqrtMaxPrice,
      isTokenA: false,
      inputTokenInfo: tokenBInfo.current,
      outputTokenInfo: tokenAInfo.current,
      inAmount: new BN(input.mul(Decimal.pow(10, tokenB!.decimals)).toString()),
    });

    setDepositQuote(depositQuote);
    setAmountB(new Decimal(depositQuote.actualInputAmount.toString()).div(Decimal.pow(10, tokenB!.decimals)))
    setAmountA(new Decimal(depositQuote.outputAmount.toString()).div(Decimal.pow(10, tokenA!.decimals)))
  }

  const swapSOLAndDeposit = async () => {
    if (!poolInfo) return;
    if (swapSolAmount.lessThanOrEqualTo(0)) return;
    try {
      const quote = await getQuote({
        inputMint: NATIVE_MINT.toBase58(),
        outputMint: poolInfo.account.tokenAMint.toBase58(),
        amount: swapSolAmount.mul(LAMPORTS_PER_SOL),
        slippageBps: jupSlippage ? jupSlippage * 100 : 200,
        excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
        devFee: devFee,
      });

      const transaction = await getSwapTransactionVersioned(quote, owner);
      await sendVersionedTxn(transaction, {
        notify: true,
        onError: () => {
          txToast.error("Swap failed");
        },
        onSuccess: async (x) => {
          txToast.success("Swap successful", x);
          await setTokensAB();
        }
      });
    } catch (e) {
      txToast.error("Failed to get swap quote!");
      console.error(e);
    }
  }

  const getClosePositionTx = async (positions: PoolPositionInfo[], amount: number) => {

    if (amount < 100)
      return await getRemoveLiquidityTx(positions, amount);

    const ixs = [];
    positions = positions.filter(x => !cpAmm.isLockedPosition(x.positionState))

    while (positions.length > 0) {
      const innerPositions = positions.splice(0, 2)
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
      ixs.push(t.instructions)
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
      ixs.push(t.instructions);
    }
    return ixs;
  };

  useEffect(() => {
    if (tokenA) {
      getDepositAmountB(new Decimal(tokenA!.amount.toString()))
    }
  }, [tokenA]);

  useEffect(() => {
    setTokensAB()
  }, []);

  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (popupRef.current &&
        !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [onClose]);

  const handleDeposit = async () => {
    if (amountA.lessThanOrEqualTo(0) || amountB.lessThanOrEqualTo(0) || !depositQuote || !poolInfo || !tokenA || !tokenB) return

    const inputA = new BN(amountA.mul(Decimal.pow(10, tokenA!.decimals)).toString());
    const inputB = new BN(amountB.mul(Decimal.pow(10, tokenB!.decimals)).toString());

    if (positionInfo) {
      const tx = await cpAmm.addLiquidity({
        owner: owner,
        positionNftAccount: positionInfo.positionNftAccount,
        pool: positionInfo.poolInfo.publicKey,
        position: positionInfo.positionAddress,
        liquidityDelta: depositQuote.liquidityDelta,
        maxAmountTokenA: inputA,
        maxAmountTokenB: inputB,
        tokenAAmountThreshold: inputA.muln(1.50),
        tokenBAmountThreshold: inputB.muln(1.50),
        tokenAMint: positionInfo.poolInfo.account.tokenAMint,
        tokenBMint: positionInfo.poolInfo.account.tokenBMint,
        tokenAVault: positionInfo.poolInfo.account.tokenAVault,
        tokenBVault: positionInfo.poolInfo.account.tokenBVault,
        tokenAProgram: getTokenProgram(positionInfo.poolInfo.account.tokenAFlag),
        tokenBProgram: getTokenProgram(positionInfo.poolInfo.account.tokenBFlag),
      })



      await sendTxn(tx.instructions, 10000, undefined, undefined, {
        notify: true,
        onSuccess: async () => {
          onClose();
          await setTokensAB();
          await refreshPositions();
        },
        onError: async () => {
          txToast.error("Failed to deposit!")
          await getDepositAmountB(amountA);
        }
      });

    } else {
      const positionNft = Keypair.generate();
      const tx = await cpAmm.createPositionAndAddLiquidity({
        owner: owner,
        pool: poolInfo.publicKey,
        positionNft: positionNft.publicKey,
        liquidityDelta: depositQuote.liquidityDelta,
        maxAmountTokenA: inputA,
        maxAmountTokenB: inputB,
        tokenAAmountThreshold: inputA.muln(1.50),
        tokenBAmountThreshold: inputB.muln(1.50),
        tokenAMint: poolInfo.account.tokenAMint,
        tokenBMint: poolInfo.account.tokenBMint,
        tokenAProgram: getTokenProgram(poolInfo.account.tokenAFlag),
        tokenBProgram: getTokenProgram(poolInfo.account.tokenBFlag),
      });

      await sendTxn(tx.instructions, 100000, [positionNft], undefined, {
        notify: true,
        onSuccess: async () => {
          onClose();
          await setTokensAB();
          await refreshPositions();
        },
        onError: async () => {
          txToast.error("Failed to add liquidity!");
          await getDepositAmountB(amountA);
        }
      });
    }
  };

  if (!poolInfo) {
    return (
      <div
        ref={popupRef}
        className={className}
      //style={{ top: position.y, left: position.x }}
      >
        <div className="mb-3 text-sm text-gray-700">Pool does not exist</div>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      className={className}
    >
      <div className="grid gap-1 text-sm font-semibold text-gray-100">
        <div className='flex flex-col gap-1 items-start'>
          <div className="flex flex-col justify-end gap-1">
            <button
              onClick={async () => {
                await setTokensAB();
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded text-md transition-colors w-auto justify-center"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
          <div>
            <input type='checkbox' checked={includeDammv2Route}
              onChange={v => setIncludeDammv2Route(v.target.checked)}
            ></input>
            <label>Include DAMMv2 route</label>
          </div>

        </div>
        <div className='flex gap-1 items-center'>
          <DecimalInput
            className="max-h-6 max-w-25 rounded-xs border border-gray-600 bg-[#1a1e2d] px-2 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:outline-none"
            value={swapSolAmount.toFixed()}
            onChange={() => { }}
            onBlur={(v) => setSwapSolAmount(v)}
          />
          <button
            className="rounded-xs max-h-6 bg-green-600 px-1 py-1 text-xs text-white hover:bg-green-700"
            onClick={() => swapSOLAndDeposit()}>
            Swap SOL
          </button>
        </div>

      </div>
      {(!tokenA || !tokenB) && (

        <div className="justify-self-center text-sm text-gray-700">Could not find one of tokens</div>
      )}

      {(tokenA && tokenB) && (

        <div className="flex flex-col gap-2">
          {/* Token A */}
          <div>
            <div className="text-sm text-gray-400">{tokenA!.symbol} Balance: {tokenA!.amount.toNumber()}</div>
            <div className="flex gap-1">
              <DecimalInput
                className="max-h-6 max-w-35 rounded-xs border border-gray-600 bg-[#1a1e2d] px-1 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:outline-none"
                value={amountA.toFixed(10)}
                onChange={() => { }}
                onBlur={(v) => getDepositAmountB(v)}
              />
              <button
                className="text-xs py-1 px-1 rounded-xs max-h-6 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => getDepositAmountB(new Decimal(tokenA!.amount.toString()))}
              >
                Max
              </button>
            </div>
          </div>

          {/* Token B */}
          <div>
            <div className="text-sm text-gray-400">{tokenB!.symbol} Balance: {tokenB!.amount.toNumber()}</div>
            <div className="flex gap-1">
              <DecimalInput
                className="max-h-6 max-w-35 rounded-xs border border-gray-600 bg-[#1a1e2d] px-1 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:outline-none"
                value={amountB.toFixed(10)}
                onChange={() => { }}
                onBlur={async (v) => {
                  await getDepositAmountA(v);
                }}
              />
              <button
                className="text-xs py-1 px-1 rounded-xs max-h-6 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => await getDepositAmountA(new Decimal(tokenB!.amount.toString()))}
              >
                Max
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            className="w-full rounded-xs max-h-6 bg-green-600 hover:bg-green-700 text-white text-sm"
            disabled={!amountA || !amountB}
            onClick={handleDeposit}
          >
            Deposit
          </button>
        </div>
      )}
      {positionInfo && (
        <div className="flex flex-col">
          <button
            className="bg-purple-600 hover:bg-purple-500 px-2 rounded-xs max-h-6 text-white"
            onClick={async () => {
              const ixs = await getClosePositionTx([positionInfo], closePositionRange)
              await sendTxn(ixs[0], 10000, undefined, undefined, {
                notify: true,
                onSuccess: async () => {
                  await setTokensAB();
                  await refreshPositions();
                },
                onError: () => {
                  txToast.error("Failed to remove liquidity!");
                }
              })
            }}
          >
            {closePositionRange < 100 ? "Remove Liquidity" : "Close Position"}
          </button>
          <div className="flex gap-1">
            <input type='range' min={10} max={100} step={10}
              className='flex grow'
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
      )}

    </div>
  );
};