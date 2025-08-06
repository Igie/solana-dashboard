import React, { useEffect, useRef, useState } from 'react';
import { getTokenProgram, type CpAmm, type DepositQuote } from '@meteora-ag/cp-amm-sdk';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import Decimal from 'decimal.js';
import type { TokenAccount } from '../../tokenUtils';
import { DecimalInput } from './DecimalInput';
import { BN } from '@coral-xyz/anchor';
import { useTokenAccounts } from '../../contexts/TokenAccountsContext';
import type { PoolDetailedInfo } from '../../constants';
import { useDammUserPositions } from '../../contexts/DammUserPositionsContext';

interface DepositPopoverProps {
  cpAmm: CpAmm;
  owner: PublicKey,
  poolInfo: PoolDetailedInfo | null;
  onClose: () => void;
  position: { x: number; y: number };
  sendTransaction:  (tx: Transaction, nft: Keypair) => Promise<boolean>;
}

export const DepositPopover: React.FC<DepositPopoverProps> = ({
  cpAmm,
  owner,
  poolInfo,
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

  const { refreshTokenAccounts } = useTokenAccounts()
  const { refreshPositions } = useDammUserPositions()

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
    })

    setDepositQuote(depositQuote);
    setAmountB(new Decimal(depositQuote.actualInputAmount.toString()).div(Decimal.pow(10, tokenB!.decimals)))
    setAmountA(new Decimal(depositQuote.outputAmount.toString()).div(Decimal.pow(10, tokenA!.decimals)))
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

  };

  if (!poolInfo) {
    return (
      <div
        ref={ref}
        className="absolute z-50 w-80 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-xl shadow-xl p-4 text-sm"
        style={{ top: position.y, left: position.x }}
      >
        <div className="mb-3 text-sm text-gray-700">Pool does not exist</div>
      </div>
    )
  }

  if (!tokenA || !tokenB) {
    return (
      <div
        ref={ref}
        className="absolute z-50 w-80 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-xl shadow-xl p-4 text-sm"
        style={{ top: position.y, left: position.x }}
      >
        <div className="mb-3 text-sm text-gray-700">Could not find one of tokens</div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 w-80 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-xl shadow-xl p-4 text-sm"
      style={{ top: position.y, left: position.x }}
    >
      <div className="flex flex-col gap-2">
        {/* Token A */}
        <div>
          <div className="mb-1 text-sm text-gray-400">{tokenA!.symbol} Balance: {tokenA!.amount}</div>
          <div className="flex">
            <DecimalInput
              className="flex-1 bg-[#1a1e2d] border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              value={amountA.toFixed(10)}
              onChange={() => { }}
              onBlur={(v) => getDepositAmountB(v)}
            />
            <button
              className="text-xs px-2 py-1 ml-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => getDepositAmountB(new Decimal(tokenA!.amount.toString()))}
            >
              Max
            </button>
          </div>
        </div>

        {/* Token B */}
        <div>
          <div className="mb-1 text-sm text-gray-400">{tokenB!.symbol} Balance: {tokenB!.amount}</div>
          <div className="flex">
            <DecimalInput
              className="flex-1 bg-[#1a1e2d] border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              value={amountB.toFixed(10)}
              onChange={() => { }}
              onBlur={async (v) => {
                await getDepositAmountA(v);
              }}
            />
            <button
              className="text-xs px-2 py-1 ml-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
              onClick={async () => await getDepositAmountA(new Decimal(tokenB!.amount.toString()))}
            >
              Max
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm"
          disabled={!amountA || !amountB}
          onClick={handleDeposit}
        >
          Deposit
        </button>
      </div>
    </div>

  );
};