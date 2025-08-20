import { type PoolState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";

import Decimal from 'decimal.js'

export const MAINNET_HELIUS_RPC: string = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;
export const DEVNET_HELIUS_RPC: string = `https://devnet.helius-rpc.com?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;

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
    activationTime: number
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

export const sortPositions = (pools: PoolDetailedInfo[], sortType: PoolSortType, ascending?: boolean) => {

    const p = pools.sort((x, y) => {
        let r = 0;
        if (ascending === null) {
            return (x.activationTime - y.activationTime);
        }
        switch (sortType) {

            case PoolSortType.PoolActivationTime:
                r = (x.activationTime - y.activationTime);
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
    if (!seconds) return "0s"

    if (seconds < 0) return seconds.toString() + "s"
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0 || d > 0) parts.push(`${h}h`)
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
    if (d === 0 && h === 0 && m === 0) parts.push(`${s}s`)

    return parts.join(' ')
}