import { CpAmm, feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice, getTokenProgram, type PoolState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";

import Decimal from 'decimal.js'
import type { PoolPositionInfo } from "./contexts/DammUserPositionsContext";
import type { TokenMetadataMap } from "./tokenUtils";
import { BN } from "@coral-xyz/anchor";

export const MAINNET_HELIUS_RPC: string = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;
export const DEVNET_HELIUS_RPC: string = `https://devnet.helius-rpc.com?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;

export const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
};

export interface PoolInfo {
    publicKey: PublicKey;
    account: PoolState;
}

export interface PoolTokenInfo {
    mint: string
    tokenProgram: string
    symbol: string
    name: string
    poolAmount: number
    decimals: number
    price: number
    image?: string,
    totalFees: Decimal,
    launchpad?: string,
}

export interface PoolDetailedInfo {
    poolInfo: PoolInfo
    tokenA: PoolTokenInfo
    tokenB: PoolTokenInfo
    age: number
    baseFeeBPS: number
    totalFeeBPS: number
    price: Decimal
    TVL: number
    lockedTVL: number
    totalFees: Decimal
}

export interface PoolDetailedInfoMap {
    [key: string]: PoolDetailedInfo
}

export interface PoolInfoMap {
    [key: string]: PoolInfo
}

export const GetPoolDetailedInfoMap = (poolDetailedInfos: PoolDetailedInfo[]): PoolDetailedInfoMap => {
    const poolDetailedInfoMap: PoolDetailedInfoMap = {}
    poolDetailedInfos.map((x) => {
        poolDetailedInfoMap[x.poolInfo.publicKey.toBase58()] = x;
    });
    return poolDetailedInfoMap;
}

export enum PoolSortType {
    PoolActivationTime,
    PoolBaseFee,
    PoolCurrentFee,
    PoolTokenAFees,
    PoolTokenBFees,
    PoolTotalFees,
}

export const getDetailedPools = (cpAmm: CpAmm, p: PoolInfo[], tm: TokenMetadataMap, currentSlot: number, currentTime: number) => {
    let newDetailedPools: PoolDetailedInfo[] = []
    for (const x of p) {

        const withdrawPoolQuote = cpAmm.getWithdrawQuote({
            liquidityDelta: x.account.liquidity,
            sqrtPrice: x.account.sqrtPrice,
            minSqrtPrice: x.account.sqrtMinPrice,
            maxSqrtPrice: x.account.sqrtMaxPrice,
        })

        const lockedWithdrawPoolQuote = cpAmm.getWithdrawQuote({
            liquidityDelta: x.account.permanentLockLiquidity,
            sqrtPrice: x.account.sqrtPrice,
            minSqrtPrice: x.account.sqrtMinPrice,
            maxSqrtPrice: x.account.sqrtMaxPrice,
        })

        const tokenAMetadata = tm[x.account.tokenAMint.toBase58()];
        const tokenBMetadata = tm[x.account.tokenBMint.toBase58()];

        if (!tokenAMetadata) {
            console.error(x.account.tokenAMint.toBase58());
            throw new Error("No Token metadata found when creating detailed pool");
        }

        if (!tokenBMetadata) {
            console.error(x.account.tokenBMint.toBase58());
            throw new Error("No Token metadata found when creating detailed pool");
        }

        const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).toNumber();
        const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata?.decimals || 6)).toNumber();

        const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata?.decimals || 6, tokenBMetadata?.decimals || 6));

        const poolTokenA = {
            mint: x.account.tokenAMint.toBase58(),
            tokenProgram: tokenAMetadata.tokenProgram,
            symbol: tokenAMetadata?.symbol || 'UNK',
            name: tokenAMetadata?.name || 'Unknown',
            poolAmount: poolTokenAAmount,
            decimals: tokenAMetadata?.decimals,
            price: tokenAMetadata?.price.toNumber(),
            image: tokenAMetadata?.image || undefined,
            totalFees: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).mul(tokenAMetadata?.price),
            launchpad: tokenAMetadata.launchpad,
            isVerified: tokenAMetadata.isVerified,
        }

        const poolTokenB = {
            mint: x.account.tokenBMint.toBase58(),
            tokenProgram: getTokenProgram(x.account.tokenBFlag).toBase58(),
            symbol: tokenBMetadata?.symbol || 'UNK',
            name: tokenBMetadata?.name || 'Unknown',
            poolAmount: poolTokenBAmount,
            decimals: tokenBMetadata?.decimals,
            price: tokenBMetadata?.price.toNumber(),
            image: tokenBMetadata?.image || undefined,
            totalFees: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),
            launchpad: tokenBMetadata.launchpad,
            isVerified: tokenBMetadata.isVerified,
        }

        const poolTokenAAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const poolTokenBAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        let activationTime = 0;
        if (x.account.activationType === 0) {
            activationTime = ((currentSlot - x.account.activationPoint.toNumber()) * 400 / 1000);
        } else {
            activationTime = currentTime - x.account.activationPoint.toNumber();
        }

        newDetailedPools.push({
            poolInfo: x,
            tokenA: poolTokenA,
            tokenB: poolTokenB,
            age: activationTime,
            baseFeeBPS: feeNumeratorToBps(getBaseFeeNumerator(
                x.account.poolFees.baseFee.feeSchedulerMode,
                x.account.poolFees.baseFee.cliffFeeNumerator,
                new BN(x.account.poolFees.baseFee.numberOfPeriod),
                x.account.poolFees.baseFee.reductionFactor
            )),
            totalFeeBPS: feeNumeratorToBps(getFeeNumerator(
                x.account.activationType === 0 ? currentSlot :
                    x.account.activationType === 1 ? currentTime : 0,
                x.account.activationPoint,
                x.account.poolFees.baseFee.numberOfPeriod,
                x.account.poolFees.baseFee.periodFrequency,
                x.account.poolFees.baseFee.feeSchedulerMode,
                x.account.poolFees.baseFee.cliffFeeNumerator,
                x.account.poolFees.baseFee.reductionFactor,
                x.account.poolFees.dynamicFee
            )),
            price: new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, poolTokenA.decimals, poolTokenB.decimals)),
            TVL: (poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmount * tokenBMetadata.price.toNumber()),
            lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmountLocked * tokenBMetadata.price.toNumber(),
            totalFees: poolTokenA.totalFees.add(poolTokenB.totalFees),
        });
    };

    return newDetailedPools;
};

export const sortPools = (pools: PoolDetailedInfo[], sortType: PoolSortType, ascending?: boolean) => {
    const p = pools.sort((x, y) => {
        let r = 0;
        if (ascending === null) {
            return (x.age - y.age);
        }
        switch (sortType) {

            case PoolSortType.PoolActivationTime:
                r = (x.age - y.age);
                break;

            case PoolSortType.PoolBaseFee:
                r = (x.baseFeeBPS - y.baseFeeBPS);
                break;

            case PoolSortType.PoolCurrentFee:
                r = (x.totalFeeBPS - y.totalFeeBPS);
                break;

            case PoolSortType.PoolTokenAFees:
                r = (x.tokenA.totalFees.sub(y.tokenA.totalFees).toNumber());
                break;

            case PoolSortType.PoolTokenBFees:
                r = (x.tokenB.totalFees.sub(y.tokenB.totalFees).toNumber());
                break;

            case PoolSortType.PoolTotalFees:
                r = (x.totalFees.sub(y.totalFees).toNumber());
                break;
        }

        if (!ascending)
            r = -r;
        return r;
    });
    pools = p;
}

export const getShortMint = (mint: PublicKey) => {
    const m = mint.toBase58();
    return m.slice(0, 4) + ".." + m.slice(m.length - 4, m.length);
}

export const getShortMintS = (mint: string) => {

    return mint.slice(0, 4) + ".." + mint.slice(mint.length - 4, mint.length);
}

export function formatDuration(seconds: number | null): string {
    if (seconds === null) return "0s"

    const future: Boolean = seconds < 0;

    if (seconds < 0)
        seconds *= -1;

    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0 || d > 0) parts.push(`${h}h`)
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
    if (d === 0 && h === 0 && m === 0) parts.push(`${s.toFixed(0)}s`)

    const full = parts.join(' ');

    if (future) return "in " + full;
    else return full + " ago";
}

export function formatDurationNumber(seconds: number | null): string {
    if (seconds === null) return "0s"
    seconds *= 60;
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0 || d > 0) parts.push(`${h}h`)
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
    if (d === 0 && h === 0 && m === 0) parts.push(`${s}s`)

    return parts.join(' ');
}

export const sleep = async (delay: number) => {
    return new Promise( res => setTimeout(res, delay) );
}

export const getSchedulerType = (mode: number) => {
    switch (mode) {
        case 0: return 'Linear';
        case 1: return 'Exponential';
        default: return 'Unknown';
    }
};

export const renderFeeTokenImages = (position: PoolPositionInfo) => {
    if (position.poolState.collectFeeMode === 0) {
        // Both tokens
        return (
            <div className="flex -space-x-1">
                {position.tokenA.image ? (
                    <img src={position.tokenA.image} alt="Token A" className="w-4 h-4 rounded-full border border-gray-600" />
                ) : (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 border border-gray-600" />
                )}
                {position.tokenB.image ? (
                    <img src={position.tokenB.image} alt="Token B" className="w-4 h-4 rounded-full border border-gray-600" />
                ) : (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 border border-gray-600" />
                )}
            </div>
        );
    } else {
        // Quote token only (tokenB)
        return position.tokenB.image ? (
            <img src={position.tokenB.image} alt="Quote Token" className="w-4 h-4 rounded-full" />
        ) : (
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500" />
        );
    }
};