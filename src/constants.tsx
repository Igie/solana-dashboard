import { BaseFeeMode, CpAmm, feeNumeratorToBps, FeeRateLimiter, FeeScheduler, getAmountAFromLiquidityDelta, getAmountBFromLiquidityDelta, getBaseFeeNumerator, getBaseFeeNumeratorByPeriod, getPriceFromSqrtPrice, getUnClaimReward, parseFeeSchedulerSecondFactor, Rounding, type PoolState, type PositionState } from "@meteora-ag/cp-amm-sdk";
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
    poolValue: number,
    positionValue: number,
    unclaimedFeeAmount: number,
    unclaimedFeeUsd: number,
    claimedFeeAmount: number,
}

export interface PoolPositionInfo {
    poolInfo: PoolInfo
    positionAddress: PublicKey
    positionNftAccount: PublicKey
    positionState: PositionState
    tokenA: PoolPositionTokenInfo
    tokenB: PoolPositionTokenInfo
    shareOfPoolPercentage: number
    poolValue: number
    poolValueChange: number,
    positionValue: number
    positionValueChange: number
    positionUnclaimedFee: number
    positionUnclaimedFeeChange: number
    positionClaimedFee: number
    poolMinFeeBPS: number
    poolCurrentFeeBPS: number
}


export interface PoolPositionInfoMap {
    [key: string]: PoolPositionInfo
}

export interface PoolInfo {
    publicKey: PublicKey;
    account: PoolState;
    lastUpdated?: number;
}

export interface PoolTokenInfo extends TokenMetadata {
    poolAmount: Decimal
    totalFeesToken: Decimal,
    totalFeesUsd: Decimal,
}

export interface Liquidity { tokenAAmount: Decimal, tokenBAmount: Decimal }

export interface PoolDetailedInfo {
    poolInfo: PoolInfo
    tokenA: PoolTokenInfo
    tokenB: PoolTokenInfo
    age: number
    minFeeBPS: number
    currentFeeBPS: number
    price: Decimal
    TVLUsd: number
    TVLUsdChange: number
    LiquidityChange: Liquidity
    lockedTVL: number
    totalFeesUsd: Decimal
    FeesLiquidityChange: Liquidity
}

export const toUsd = (l: Liquidity, pool: PoolDetailedInfo) => {
    return l.tokenAAmount.mul(pool.tokenA.price).toNumber() + l.tokenBAmount.mul(pool.tokenB.price).toNumber();
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
    PoolLastUpdated
}

const getWithdrawQuote = (liquidityDelta: BN, poolInfo: PoolInfo) => {
    if (liquidityDelta.lte(new BN(0))) return [new BN(0), new BN(0)];
    const amountA = getAmountAFromLiquidityDelta(
        poolInfo.account.sqrtPrice,
        poolInfo.account.sqrtMaxPrice,
        liquidityDelta,
        Rounding.Down
    );
    const amountB = getAmountBFromLiquidityDelta(
        poolInfo.account.sqrtMinPrice,
        poolInfo.account.sqrtPrice,
        liquidityDelta,
        Rounding.Down
    );

    return [
        amountA,
        amountB
    ];
}

export const getDetailedPools = (p: PoolInfo[], tm: TokenMetadataMap, currentSlot: number, currentTime: number) => {
    let newDetailedPools: PoolDetailedInfo[] = []
    for (const x of p) {
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

        const [tokenAAmount, tokenBAmount] = getWithdrawQuote(x.account.liquidity, x);
        const poolTokenAAmount = new Decimal(tokenAAmount.toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6));
        const poolTokenBAmount = new Decimal(tokenBAmount.toString()).div(Decimal.pow(10, tokenBMetadata?.decimals || 6));

        const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata?.decimals || 6, tokenBMetadata?.decimals || 6));

        const poolTokenA = {
            ...tokenAMetadata,
            poolAmount: poolTokenAAmount,
            totalFeesUsd: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).mul(tokenAMetadata?.price),
            totalFeesToken: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)),
        }

        const poolTokenB = {
            ...tokenBMetadata,
            poolAmount: poolTokenBAmount,
            totalFeesUsd: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),
            totalFeesToken: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)),
        }

        const [tokenAAmountLocked, tokenBAmountLocked] = getWithdrawQuote(x.account.permanentLockLiquidity, x);
        const poolTokenAAmountLocked = new Decimal(tokenAAmountLocked.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const poolTokenBAmountLocked = new Decimal(tokenBAmountLocked.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        let activationTime = 0;
        if (x.account.activationType === 0) {
            activationTime = ((currentSlot - x.account.activationPoint.toNumber()) * 400 / 1000);
        } else {
            activationTime = currentTime - x.account.activationPoint.toNumber();
        }
        const [minFee, currentFee] = getMinAndCurrentFee(x, x.account.activationType === 0 ? currentSlot :
            x.account.activationType === 1 ? currentTime : 0);
        newDetailedPools.push({
            poolInfo: x,
            tokenA: poolTokenA,
            tokenB: poolTokenB,
            age: activationTime,
            minFeeBPS: minFee,
            currentFeeBPS: currentFee,
            price: new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, poolTokenA.decimals, poolTokenB.decimals)),
            TVLUsd: (poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmount.mul(tokenBMetadata.price).toNumber()),
            TVLUsdChange: 0,
            LiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
            lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmountLocked * tokenBMetadata.price.toNumber(),
            totalFeesUsd: poolTokenA.totalFeesUsd.add(poolTokenB.totalFeesUsd),
            FeesLiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
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
                r = (x.minFeeBPS - y.minFeeBPS);
                break;

            case PoolSortType.PoolCurrentFee:
                r = (x.currentFeeBPS - y.currentFeeBPS);
                break;

            case PoolSortType.PoolTokenAFees:
                r = (x.tokenA.totalFeesUsd.sub(y.tokenA.totalFeesUsd).toNumber());
                break;

            case PoolSortType.PoolTokenBFees:
                r = (x.tokenB.totalFeesUsd.sub(y.tokenB.totalFeesUsd).toNumber());
                break;

            case PoolSortType.PoolTotalFees:
                r = (x.totalFeesUsd.sub(y.totalFeesUsd).toNumber());
                break;

            case PoolSortType.PoolLastUpdated:

                r = (y.poolInfo.lastUpdated === undefined ? Number.MIN_VALUE : y.poolInfo.lastUpdated) -
                    (x.poolInfo.lastUpdated === undefined ? Number.MIN_VALUE : x.poolInfo.lastUpdated);
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
                    poolValue: 0,
                    positionValue: 0,
                    decimals: 1,
                    unclaimedFeeAmount: 0,
                    unclaimedFeeUsd: 0,
                    claimedFeeAmount: 0,
                },
                tokenB: {
                    ...pool.tokenB,
                    poolAmount: 0,
                    positionAmount: 0,
                    poolValue: 0,
                    positionValue: 0,
                    decimals: 1,
                    unclaimedFeeAmount: 0,
                    unclaimedFeeUsd: 0,
                    claimedFeeAmount: 0,
                },
                shareOfPoolPercentage: 0.5,
                poolValue: 0,
                poolValueChange: 0,
                positionValue: 0,
                positionValueChange: 0,
                positionUnclaimedFee: 0,
                positionClaimedFee: 0,
                positionUnclaimedFeeChange: 0,
                poolMinFeeBPS: 0,
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

            const tokenAUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();
            const tokenAClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolPrice = getPriceFromSqrtPrice(position.poolInfo.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

            const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

            position.tokenA.tokenProgram = tokenAMetadata?.tokenProgram;
            position.tokenA.name = tokenAMetadata?.name || 'Unknown Token';
            position.tokenA.symbol = tokenAMetadata?.symbol || 'UNK';
            position.tokenA.image = tokenAMetadata?.image;
            position.tokenA.decimals = tokenAMetadata?.decimals;
            position.tokenA.poolAmount = poolTokenAAmount;
            position.tokenA.poolValue = position.tokenA.price.mul(poolTokenAAmount).toNumber();
            position.tokenA.positionAmount = positionTokenAAmount;
            position.tokenA.positionValue = poolPrice * positionTokenAAmount * tokenBMetadata.price.toNumber();
            position.tokenA.unclaimedFeeAmount = tokenAUnclaimedFeesAmount
            position.tokenA.unclaimedFeeUsd = poolPrice * tokenAUnclaimedFeesAmount * tokenBMetadata.price.toNumber();
            position.tokenA.claimedFeeAmount = tokenAClaimedFeesAmount;

            position.tokenB.tokenProgram = tokenBMetadata?.tokenProgram;
            position.tokenB.name = tokenBMetadata?.name || 'Unknown Token';
            position.tokenB.symbol = tokenBMetadata?.symbol || 'UNK';
            position.tokenB.image = tokenBMetadata?.image;
            position.tokenB.decimals = tokenBMetadata?.decimals;
            position.tokenB.poolAmount = poolTokenBAmount;
            position.tokenB.poolValue = position.tokenB.price.mul(poolTokenBAmount).toNumber();
            position.tokenB.positionAmount = positionTokenBAmount;
            position.tokenB.positionValue = positionTokenBAmount * tokenBMetadata.price.toNumber();
            position.tokenB.unclaimedFeeAmount = tokenBUnclaimedFeesAmount
            position.tokenB.unclaimedFeeUsd = tokenBUnclaimedFeesAmount * tokenBMetadata.price.toNumber();
            position.tokenB.claimedFeeAmount = tokenBClaimedFeesAmount;

            position.poolValue = (poolTokenAAmount * poolPrice +
                poolTokenBAmount) * tokenBMetadata!.price.toNumber();

            position.positionValue = (positionTokenAAmount * poolPrice +
                positionTokenBAmount) * tokenBMetadata!.price.toNumber();

            position.shareOfPoolPercentage = shareOfPool;

            position.positionUnclaimedFee =
                tokenAUnclaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                tokenBUnclaimedFeesAmount * tokenBMetadata!.price.toNumber();

            position.positionClaimedFee =
                tokenAClaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                tokenBClaimedFeesAmount * tokenBMetadata!.price.toNumber();


            const [minFee, currentFee] = getMinAndCurrentFee(position.poolInfo, position.poolInfo.account.activationType === 0 ? currentSlot :
                position.poolInfo.account.activationType === 1 ? currentTime : 0);

            position.poolMinFeeBPS = minFee;

            position.poolCurrentFeeBPS = currentFee;
            positionsParsed.push(position)
        };

        return positionsParsed.map(x => { return { owner: new PublicKey(0), position: x } });


    } catch (e) {
        console.log(e);
        return [];
    }
}
export interface BaseFee {
    cliffFeeNumerator: BN;
    baseFeeMode: number;
    firstFactor: number;
    secondFactor: number[];
    thirdFactor: BN;
}

export const getFeeScheduler = (baseFee: BaseFee) => {
    if (baseFee.baseFeeMode === BaseFeeMode.RateLimiter)
        throw new Error("Pool is using Rate Limiter fee mode, no Fee Scheduler available");
    const feeScheduler = new FeeScheduler(
        baseFee.cliffFeeNumerator,
        baseFee.firstFactor,
        new BN(
            Buffer.from(baseFee.secondFactor.slice(0, 8)),
            "le"
        ),
        baseFee.thirdFactor,
        baseFee.baseFeeMode
    );

    return feeScheduler;
}

export const getMinAndCurrentFee = (p: PoolInfo, currentPoint: number) => {
    if (p.account.poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {

        const maxLimiterDuration = Buffer.from(
            p.account.poolFees.baseFee.secondFactor.slice(0, 4)
        ).readUInt32LE(0);
        const maxFeeBps = Buffer.from(p.account.poolFees.baseFee.secondFactor.slice(4, 8)).readUInt32LE(0);

        const feeRateLimiter = new FeeRateLimiter(
            p.account.poolFees.baseFee.cliffFeeNumerator,
            p.account.poolFees.baseFee.firstFactor,
            maxLimiterDuration,
            maxFeeBps,
            p.account.poolFees.baseFee.thirdFactor
        );




        return [feeNumeratorToBps(feeRateLimiter.cliffFeeNumerator), feeNumeratorToBps(feeRateLimiter.cliffFeeNumerator.addn(feeRateLimiter.feeIncrementBps))];
    }

    const feeScheduler = new FeeScheduler(
        p.account.poolFees.baseFee.cliffFeeNumerator,
        p.account.poolFees.baseFee.firstFactor,
        new BN(
            Buffer.from(p.account.poolFees.baseFee.secondFactor.slice(0, 8)),
            "le"
        ),
        p.account.poolFees.baseFee.thirdFactor,
        p.account.poolFees.baseFee.baseFeeMode
    );

    const minFeeNumerator =
        getBaseFeeNumeratorByPeriod(feeScheduler.cliffFeeNumerator,
            feeScheduler.numberOfPeriod,
            new BN(feeScheduler.numberOfPeriod),
            feeScheduler.reductionFactor,
            feeScheduler.feeSchedulerMode
        );


    const currentFeeNumerator = getBaseFeeNumerator(
        feeScheduler.cliffFeeNumerator,
        p.account.poolFees.baseFee.firstFactor,
        parseFeeSchedulerSecondFactor(p.account.poolFees.baseFee.secondFactor),
        new BN(p.account.poolFees.baseFee.thirdFactor),
        p.account.poolFees.baseFee.baseFeeMode,
        new BN(currentPoint),
        p.account.activationPoint // activationPoint
    );

    return [feeNumeratorToBps(minFeeNumerator), feeNumeratorToBps(currentFeeNumerator)];
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
    if (d === 0 && h === 0 && m === 0) parts.push(`${s.toFixed(0)}s`)

    return parts.join(' ');
}

export const sleep = async (delay: number) => {
    return new Promise(res => setTimeout(res, delay));
}

export const getSchedulerType = (mode: number) => {
    switch (mode) {
        case BaseFeeMode.FeeSchedulerLinear: return 'Linear';
        case BaseFeeMode.FeeSchedulerExponential: return 'Exponential';
        case BaseFeeMode.RateLimiter: return 'Rate Limiter';
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