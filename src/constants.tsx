import { type PoolState} from "@meteora-ag/cp-amm-sdk";
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

export function getFirstKey(key1: PublicKey, key2: PublicKey) {
  const buf1 = key1.toBuffer();
  const buf2 = key2.toBuffer();
  if (Buffer.compare(buf1, buf2) === 1) {
    return buf1;
  }
  return buf2;
}

export function getSecondKey(key1: PublicKey, key2: PublicKey) {
  const buf1 = key1.toBuffer();
  const buf2 = key2.toBuffer();
  if (Buffer.compare(buf1, buf2) === 1) {
    return buf2;
  }
  return buf1;
}

export const derivePoolAddressFromConfig = (tokenA: string, tokenB: string, config: string): string => {
    const key1 = new PublicKey(tokenA);
    const key2 = new PublicKey(tokenB);
    return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      new PublicKey(config).toBuffer(),
      getFirstKey(key1, key2),
      getSecondKey(key1, key2),
    ],
    new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG")
  )[0].toBase58();
}