import React, { useEffect, useRef, useState } from 'react';
import { getTokenProgram, type CpAmm, type DepositQuote } from '@meteora-ag/cp-amm-sdk';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { type TokenAccount } from '../../tokenUtils';
import { DecimalInput } from './DecimalInput';
import { BN } from '@coral-xyz/anchor';
import { useTokenAccounts } from '../../contexts/TokenAccountsContext';
import type { PoolDetailedInfo } from '../../constants';
import { useDammUserPositions, type PoolPositionInfo } from '../../contexts/DammUserPositionsContext';
import { getQuote, getSwapTransactionVersioned } from '../../JupSwapApi';
import { NATIVE_MINT } from '@solana/spl-token';
import { useTransactionManager } from '../../contexts/TransactionManagerContext';
import { txToast } from './TxToast';
import { useSettings } from '../../contexts/SettingsContext';


interface DepositPopoverProps {
  cpAmm: CpAmm;
  owner: PublicKey,
  poolInfo: PoolDetailedInfo | null;
  positionInfo: PoolPositionInfo | null;
  onClose: () => void;
  position: { x: number; y: number };
  sendTransaction: (tx: Transaction, nft: Keypair | null) => Promise<boolean>;
}

export const DepositPopover: React.FC<DepositPopoverProps> = ({
  cpAmm,
  owner,
  poolInfo,
  positionInfo,
  onClose,
  position,
  sendTransaction,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [amountA, setAmountA] = useState(new Decimal(0));
  const [amountB, setAmountB] = useState(new Decimal(0));

  const [tokenA, setTokenA] = useState<TokenAccount | undefined>(undefined);
  const [tokenB, setTokenB] = useState<TokenAccount | undefined>(undefined);

  const [depositQuote, setDepositQuote] = useState<DepositQuote>();

  const [swapSolAmount, setSwapSolAmount] = useState(new Decimal(0.01));

  const { jupSlippage, includeDammv2Route, setIncludeDammv2Route } = useSettings();
  const { sendTxn } = useTransactionManager();
  const { refreshTokenAccounts } = useTokenAccounts();
  const { refreshPositions } = useDammUserPositions();

  const setTokensAB = async () => {
    if (!poolInfo) return;
    const ta = await refreshTokenAccounts();
    setTokenA(ta.tokenAccounts.find(x => x.mint == poolInfo.poolInfo.account.tokenAMint.toBase58()))
    setTokenB(ta.tokenAccounts.find(x => x.mint == poolInfo.poolInfo.account.tokenBMint.toBase58()))
  }

  const refreshPool = async () => {
    if (!poolInfo) return;
    poolInfo.poolInfo.account = await cpAmm.fetchPoolState(poolInfo.poolInfo.publicKey);
  }

  const getDepositAmountB = async (input: Decimal) => {
    if (!poolInfo) return;
    await refreshPool();
    if (!tokenA || !tokenB) return;

    const depositQuote = cpAmm.getDepositQuote({
      sqrtPrice: poolInfo.poolInfo.account.sqrtPrice,
      minSqrtPrice: poolInfo.poolInfo.account.sqrtMinPrice,
      maxSqrtPrice: poolInfo.poolInfo.account.sqrtMaxPrice,
      isTokenA: true,
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
      sqrtPrice: poolInfo.poolInfo.account.sqrtPrice,
      minSqrtPrice: poolInfo.poolInfo.account.sqrtMinPrice,
      maxSqrtPrice: poolInfo.poolInfo.account.sqrtMaxPrice,
      isTokenA: false,
      inAmount: new BN(input.mul(Decimal.pow(10, tokenB!.decimals)).toString()),
    });

    setDepositQuote(depositQuote);
    setAmountB(new Decimal(depositQuote.actualInputAmount.toString()).div(Decimal.pow(10, tokenB!.decimals)))
    setAmountA(new Decimal(depositQuote.outputAmount.toString()).div(Decimal.pow(10, tokenA!.decimals)))
  }

  const swapSOLAndDeposit = async () => {
    if (!poolInfo) return;
    if (swapSolAmount.lessThanOrEqualTo(0)) return;

    console.log(jupSlippage, includeDammv2Route);

    const quote = await getQuote({
      inputMint: NATIVE_MINT.toBase58(),
      outputMint: poolInfo.poolInfo.account.tokenAMint.toBase58(),
      amount: swapSolAmount.mul(LAMPORTS_PER_SOL),
      slippageBps: jupSlippage ? jupSlippage * 100 : 200,
      excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
    });

    const transaction = await getSwapTransactionVersioned(quote, owner);

    await sendTxn(transaction, undefined, {
      notify: true,
      onError: () => {
        txToast.error("Swap failed");
      },
      onSuccess: async (x) => {
        txToast.success("Swap successful", x);
        await setTokensAB();
      }
    });
  }

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
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
        pool: positionInfo.poolAddress,
        position: positionInfo.positionAddress,
        liquidityDelta: depositQuote.liquidityDelta,
        maxAmountTokenA: inputA,
        maxAmountTokenB: inputB,
        tokenAAmountThreshold: inputA.muln(1.50),
        tokenBAmountThreshold: inputB.muln(1.50),
        tokenAMint: positionInfo.poolState.tokenAMint,
        tokenBMint: positionInfo.poolState.tokenBMint,
        tokenAVault: positionInfo.poolState.tokenAVault,
        tokenBVault: positionInfo.poolState.tokenBVault,
        tokenAProgram: getTokenProgram(positionInfo.poolState.tokenAFlag),
        tokenBProgram: getTokenProgram(positionInfo.poolState.tokenBFlag),
      })
      const success = await sendTransaction(tx, null);
      if (success) {
        onClose();
        await refreshTokenAccounts();
        await refreshPositions();
      }
    } else {
      const positionNft = Keypair.generate();
      const tx = await cpAmm.createPositionAndAddLiquidity({
        owner: owner,
        pool: poolInfo.poolInfo.publicKey,
        positionNft: positionNft.publicKey,
        liquidityDelta: depositQuote.liquidityDelta,
        maxAmountTokenA: inputA,
        maxAmountTokenB: inputB,

        tokenAAmountThreshold: inputA.muln(1.50),
        tokenBAmountThreshold: inputB.muln(1.50),
        tokenAMint: poolInfo.poolInfo.account.tokenAMint,
        tokenBMint: poolInfo.poolInfo.account.tokenBMint,
        tokenAProgram: getTokenProgram(poolInfo.poolInfo.account.tokenAFlag),
        tokenBProgram: getTokenProgram(poolInfo.poolInfo.account.tokenBFlag),

      });
      const success = await sendTransaction(tx, positionNft);
      if (success) {
        onClose();
        await refreshTokenAccounts();
        await refreshPositions();
      }
    }
  };

  if (!poolInfo) {
    return (
      <div
        ref={ref}
        className="absolute z-50 w-80 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-md p-2 text-sm"
        style={{ top: position.y, left: position.x }}
      >
        <div className="mb-3 text-sm text-gray-700">Pool does not exist</div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-md p-2 text-sm justify-center"
      style={{ top: position.y, left: position.x }}
    >
      <div className="grid gap-1 text-sm font-semibold text-gray-100">
        <div className='flex gap-1 items-center'>
          <input type='checkbox' checked={includeDammv2Route}
            onChange={v => setIncludeDammv2Route(v.target.checked)}
          ></input>
          <label>Include DAMMv2 route</label>
        </div>
        <div className='flex gap-1 items-center'>
          <DecimalInput
            className='flex-1 bg-[#1a1e2d] max-w-40 border border-gray-600 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500'
            value={swapSolAmount.toFixed()}
            onChange={() => { }}
            onBlur={(v) => setSwapSolAmount(v)}
          />
          <button
            className="bg-green-600 hover:bg-green-700 text-white p-1 rounded text-sm"
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
            <div className="flex">
              <DecimalInput
                className="flex-1 bg-[#1a1e2d] border border-gray-600 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={amountA.toFixed(10)}
                onChange={() => { }}
                onBlur={(v) => getDepositAmountB(v)}
              />
              <button
                className="text-xs py-1 px-2 ml-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => getDepositAmountB(new Decimal(tokenA!.amount.toString()))}
              >
                Max
              </button>
            </div>
          </div>

          {/* Token B */}
          <div>
            <div className="text-sm text-gray-400">{tokenB!.symbol} Balance: {tokenB!.amount.toNumber()}</div>
            <div className="flex">
              <DecimalInput
                className="flex-1 bg-[#1a1e2d] border border-gray-600 rounded p-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={amountB.toFixed(10)}
                onChange={() => { }}
                onBlur={async (v) => {
                  await getDepositAmountA(v);
                }}
              />
              <button
                className="text-xs py-1  px-2 ml-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => await getDepositAmountA(new Decimal(tokenB!.amount.toString()))}
              >
                Max
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            className="w-full bg-green-600 hover:bg-green-700 text-white py-1 rounded text-sm"
            disabled={!amountA || !amountB}
            onClick={handleDeposit}
          >
            Deposit
          </button>
        </div>
      )}
    </div>
  );
};