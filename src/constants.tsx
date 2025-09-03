import { type PoolState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";

import Decimal from 'decimal.js'
import type { PoolPositionInfo } from "./contexts/DammUserPositionsContext";

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
    totalFees: Decimal
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
    return m.slice(0, 4) + "...." + m.slice(m.length - 4, m.length);
}

export const getShortMintS = (mint: string) => {

    return mint.slice(0, 4) + "...." + mint.slice(mint.length - 4, mint.length);
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
    if (d === 0 && h === 0 && m === 0) parts.push(`${s}s`)

        const full = parts.join(' ');

    if (future) return "in " + full;
    else return full + " ago";
}

export function formatDurationNumber(seconds: number | null): string {
    if (seconds === null) return "0s"
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