import { type PoolState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";

import Decimal from 'decimal.js'

//export const HELIUS_RPC: string = "https://mainnet.helius-rpc.com/?api-key=bcfb59d7-f9d7-4b23-8d12-6c5a31c0e014"
export const MAINNET_HELIUS_RPC: string = "https://mainnet.helius-rpc.com/?api-key=82313df7-fd1f-4290-a697-0c282f8ee8d7";
export const DEVNET_HELIUS_RPC: string = "https://devnet.helius-rpc.com?api-key=82313df7-fd1f-4290-a697-0c282f8ee8d7";
//export const HELIUS_RPC: string = "https://api.devnet.solana.com"

export const SOL_MINT = "So11111111111111111111111111111111111111112";

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
    image?: string
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
}

export interface PoolDetailedInfoMap {
    [key: string]: PoolDetailedInfo
}

export enum PoolSortType {
    PoolActivationTime,
    PoolBaseFee,
    PoolCurrentFee,
}

export const getShortMint = (mint: PublicKey) => {
    const m = mint.toBase58();
    return m.slice(0, 4) + "...." + m.slice(m.length - 4, m.length);
}

export const getShortMintS = (mint: string) => {

    return mint.slice(0, 4) + "...." + mint.slice(mint.length - 4, mint.length);
}