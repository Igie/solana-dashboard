import { CpAmm, feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice, getUnClaimReward, type PoolState, type PositionState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey } from "@solana/web3.js";

import Decimal from 'decimal.js'

import { BN } from "@coral-xyz/anchor";
import type { TokenMetadata, TokenMetadataMap } from "./contexts/TokenMetadataContext";

export const MAINNET_HELIUS_RPC: string = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;
export const DEVNET_HELIUS_RPC: string = `https://devnet.helius-rpc.com?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;

export const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
};

export interface PoolPositionTokenInfo extends TokenMetadata {
    poolAmount: number
    positionAmount: number
    unclaimedFee: number
    claimedFee: number
}

export interface PoolPositionInfo {
    poolInfo: PoolInfo
    positionAddress: PublicKey
    positionNftAccount: PublicKey
    positionState: PositionState
    tokenA: PoolPositionTokenInfo
    tokenB: PoolPositionTokenInfo
    shareOfPoolPercentage: number
    poolValue: number // USD value
    positionValue: number
    positionUnclaimedFee: number
    positionClaimedFee: number
    poolBaseFeeBPS: number
    poolCurrentFeeBPS: number
}


export interface PoolPositionInfoMap {
    [key: string]: PoolPositionInfo
}

export interface PoolInfo {
    publicKey: PublicKey;
    account: PoolState;
}

export interface PoolTokenInfo extends TokenMetadata {
    poolAmount: number
    totalFees: Decimal,
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

export const GetPoolInfoMap = (poolDetailedInfos: PoolInfo[]): PoolInfoMap => {
    const poolInfoMap: PoolInfoMap = {}
    poolDetailedInfos.map((x) => {
        poolInfoMap[x.publicKey.toBase58()] = x;
    });
    return poolInfoMap;
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
            ...tokenAMetadata,
            poolAmount: poolTokenAAmount,
            totalFees: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).mul(tokenAMetadata?.price),
        }

        const poolTokenB = {
            ...tokenBMetadata,
            poolAmount: poolTokenBAmount,
            totalFees: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),

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

export const getAllPoolPositions = async (cpAmm: CpAmm, pool: PoolDetailedInfo, currentSlot: number):
    Promise<{ owner: PublicKey, position: PoolPositionInfo }[]> => {
    if (!pool) return [];
    try {
        const currentTime = Date.now() / 1000;
        const positionsTemp: PoolPositionInfo[] = [];

        const allPoolPositions = await cpAmm.getAllPositionsByPool(pool.poolInfo.publicKey)

        if (allPoolPositions.length == 0) return [];
        for (const userPosition of allPoolPositions) {


            positionsTemp.push({
                poolInfo: pool.poolInfo,
                positionAddress: userPosition.publicKey,
                positionNftAccount: userPosition.account.nftMint,
                positionState: userPosition.account,
                tokenA:
                {
                    ...pool.tokenA,
                    poolAmount: 0,
                    positionAmount: 0,
                    decimals: 1,
                    unclaimedFee: 0,
                    claimedFee: 0,
                },
                tokenB: {
                    ...pool.tokenB,
                    poolAmount: 0,
                    positionAmount: 0,
                    decimals: 1,
                    unclaimedFee: 0,
                    claimedFee: 0,
                },
                shareOfPoolPercentage: 0.5,
                poolValue: 0,
                positionValue: 0,
                positionUnclaimedFee: 0,
                positionClaimedFee: 0,
                poolBaseFeeBPS: 0,
                poolCurrentFeeBPS: 0,
            })

        };

        if (positionsTemp.length === 0) {
            return [];
        }

        const positionsParsed: PoolPositionInfo[] = [];
        for (const position of positionsTemp) {

            const tokenAMetadata = pool.tokenA;
            const tokenBMetadata = pool.tokenB;

            const positionLP = position.positionState.permanentLockedLiquidity.add(
                position.positionState.unlockedLiquidity).add(
                    position.positionState.vestedLiquidity)

            const poolLP = position.poolInfo.account.liquidity;

            const withdrawPoolQuote = cpAmm!.getWithdrawQuote({
                liquidityDelta: poolLP,
                sqrtPrice: position.poolInfo.account.sqrtPrice,
                minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
                maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
            });

            const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata.decimals)).toNumber();
            const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata.decimals)).toNumber();

            const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
                liquidityDelta: positionLP,
                sqrtPrice: position.poolInfo.account.sqrtPrice,
                minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
                maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
            });

            const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const unclaimedRewards = getUnClaimReward(position.poolInfo.account, position.positionState);

            const tokenAUnclaimedFees = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBUnclaimedFees = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();
            const tokenAClaimedFees = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBClaimedFees = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolPrice = getPriceFromSqrtPrice(position.poolInfo.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

            const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

            position.tokenA.tokenProgram = tokenAMetadata?.tokenProgram;
            position.tokenA.name = tokenAMetadata?.name || 'Unknown Token';
            position.tokenA.symbol = tokenAMetadata?.symbol || 'UNK';
            position.tokenA.image = tokenAMetadata?.image;
            position.tokenA.decimals = tokenAMetadata?.decimals;
            position.tokenA.poolAmount = poolTokenAAmount;
            position.tokenA.positionAmount = positionTokenAAmount;
            position.tokenA.unclaimedFee = tokenAUnclaimedFees;
            position.tokenA.claimedFee = tokenAClaimedFees;

            position.tokenB.tokenProgram = tokenBMetadata?.tokenProgram;
            position.tokenB.name = tokenBMetadata?.name || 'Unknown Token';
            position.tokenB.symbol = tokenBMetadata?.symbol || 'UNK';
            position.tokenB.image = tokenBMetadata?.image;
            position.tokenB.decimals = tokenBMetadata?.decimals;
            position.tokenB.poolAmount = poolTokenBAmount;
            position.tokenB.positionAmount = positionTokenBAmount;
            position.tokenB.unclaimedFee = tokenBUnclaimedFees;
            position.tokenB.claimedFee = tokenBClaimedFees;

            position.poolValue = (poolTokenAAmount * poolPrice +
                poolTokenBAmount) * tokenBMetadata!.price.toNumber();

            position.positionValue = (positionTokenAAmount * poolPrice +
                positionTokenBAmount) * tokenBMetadata!.price.toNumber();

            position.shareOfPoolPercentage = shareOfPool;

            position.positionUnclaimedFee =
                tokenAUnclaimedFees * tokenAMetadata!.price.toNumber() +
                tokenBUnclaimedFees * tokenBMetadata!.price.toNumber();

            position.positionClaimedFee =
                tokenAClaimedFees * tokenAMetadata!.price.toNumber() +
                tokenBClaimedFees * tokenBMetadata!.price.toNumber();


            position.poolBaseFeeBPS = feeNumeratorToBps(getBaseFeeNumerator(
                position.poolInfo.account.poolFees.baseFee.feeSchedulerMode,
                position.poolInfo.account.poolFees.baseFee.cliffFeeNumerator,
                new BN(position.poolInfo.account.poolFees.baseFee.numberOfPeriod),
                position.poolInfo.account.poolFees.baseFee.reductionFactor));

            position.poolCurrentFeeBPS = feeNumeratorToBps(getFeeNumerator(
                position.poolInfo.account.activationType === 0 ? currentSlot :
                    position.poolInfo.account.activationType === 1 ? currentTime : 0,
                position.poolInfo.account.activationPoint,
                position.poolInfo.account.poolFees.baseFee.numberOfPeriod,
                position.poolInfo.account.poolFees.baseFee.periodFrequency,
                position.poolInfo.account.poolFees.baseFee.feeSchedulerMode,
                position.poolInfo.account.poolFees.baseFee.cliffFeeNumerator,
                position.poolInfo.account.poolFees.baseFee.reductionFactor,
                position.poolInfo.account.poolFees.dynamicFee
            ));
            positionsParsed.push(position)
        };

        return positionsParsed.map(x => { return { owner: new PublicKey(0), position: x } });


    } catch (e) {
        console.log(e);
        return [];
    }
}

export const getPoolPositionFromPublicKeys = (poolPositions: PoolPositionInfo[], publicKeys: string[]) => {

    const map: {
        [key: string]: PoolPositionInfo
    } = {}
    for (const pos of poolPositions)
        map[pos.positionAddress.toBase58()] = pos;
    const filtered = publicKeys.map(x => map[x]).filter(x => x !== undefined);
    console.log(filtered)
    return filtered;
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
    return new Promise(res => setTimeout(res, delay));
}

export const getSchedulerType = (mode: number) => {
    switch (mode) {
        case 0: return 'Linear';
        case 1: return 'Exponential';
        default: return 'Unknown';
    }
};

export const renderFeeTokenImages = (position: PoolPositionInfo) => {
    if (position.poolInfo.account.collectFeeMode === 0) {
        // Both tokens
        return (
            <div className="flex -space-x-1 w-8">
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
        return (
            <div className="flex -space-x-1 w-8">
                {position.tokenB.image ? (
                    <img src={position.tokenB.image} alt="Token B" className="w-4 h-4 rounded-full border border-gray-600" />
                ) : (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 border border-gray-600" />
                )}
            </div>
        );
    }
};