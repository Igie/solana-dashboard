import React, { createContext, useContext, useEffect, useState } from 'react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { BaseFeeMode, getPriceFromSqrtPrice, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk'
import Decimal from 'decimal.js'
import { BN } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { useTransactionManager } from './TransactionManagerContext';
import { txToast } from '../components/Simple/TxToast';
import { getQuote, getSwapTransactionVersioned } from '../JupSwapApi'
import { useTokenAccounts } from './TokenAccountsContext'
import { useCpAmm } from './CpAmmContext'
//import { useSettings } from './SettingsContext'
import { getMinAndCurrentFee, getRateLimiter, type PoolPositionInfo, type PoolPositionInfoMap } from '../constants'
import { useGetSlot } from './GetSlotContext'
import { useDammV2PoolsWebsocket } from './Dammv2PoolContext'
import { useTokenMetadata } from './TokenMetadataContext'
import { NATIVE_MINT } from '@solana/spl-token'



export const getPoolPositionMap = (poolPositions: PoolPositionInfo[]): PoolPositionInfoMap => {
    const poolPositionMap: PoolPositionInfoMap = {}
    poolPositions.map((x) => {
        poolPositionMap[x.poolInfo.publicKey.toBase58()] = x;
    });
    return poolPositionMap;
}

export enum SortType {
    PoolValue,
    PoolShare,
    PositionValue,
    PositionUnclaimedFee,
    PositionClaimedFee,
    PoolBaseFee,
    PoolCurrentFee,
    PoolAge,
}

export interface TotalLiquidity {
    totalUsdValue: number,
    solAmount: number,
    otherUsdValue: number,
}

interface DammUserPositionsContextType {
    positions: PoolPositionInfo[]
    userLiquidity: TotalLiquidity | undefined,
    userUnclaimedFees: TotalLiquidity | undefined,
    loading: boolean
    refreshPositions: () => Promise<void>
    sortPositionsBy: (sortType: SortType, ascending?: boolean) => void
    updatePosition: (positionAddress: PublicKey) => void
    removePosition: (positionAddress: PublicKey) => void
    removeLiquidityAndSwapToQuote: (position: PoolPositionInfo) => void
    //getZapOutTx: (positions: PoolPositionInfo[]) => Promise<Transaction[]>
    //zapOutProgress: string,
    sortedBy: SortType,
    sortedAscending: boolean | undefined,
}

const DammUserPositionsContext = createContext<DammUserPositionsContextType>({
    positions: [],
    userLiquidity: undefined,
    userUnclaimedFees: undefined,
    loading: false,
    refreshPositions: async () => { },

    sortPositionsBy: (_sortType: SortType, _ascending?: boolean) => { },
    updatePosition: async (_positionAddress: PublicKey) => { },
    removePosition: (_positionAddress: PublicKey) => { },
    removeLiquidityAndSwapToQuote: (_position: PoolPositionInfo) => { },
    //getZapOutTx: async (_positions: PoolPositionInfo[]) => [],
    //zapOutProgress: "",
    sortedBy: SortType.PoolValue,
    sortedAscending: true,
})

export const useDammUserPositions = () => useContext(DammUserPositionsContext)

export const DammUserPositionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    //const { jupZapOutSlippage, includeDammv2Route } = useSettings();
    const { connection } = useConnection();
    const { getSlot } = useGetSlot();
    const { publicKey } = useWallet();
    const { updatedPools } = useDammV2PoolsWebsocket();
    const { sendTxn, sendVersionedTxn } = useTransactionManager();
    const { cpAmm, } = useCpAmm();
    const { fetchTokenMetadata } = useTokenMetadata();
    const { refreshTokenAccounts } = useTokenAccounts();
    const [sortedBy, setSortBy] = useState<SortType>(SortType.PoolBaseFee);
    const [sortedAscending, setSortAscending] = useState<boolean | undefined>(true);
    const [positions, setPositions] = useState<PoolPositionInfo[]>([])
    const [userLiquidity, setUserLiquidity] = useState<TotalLiquidity>()
    const [userUnclaimedFees, setUserUnclaimedFees] = useState<TotalLiquidity>()

    const [loading, setLoading] = useState(false)

    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber())


    //const zap = new Zap(connection);

    const refreshPositions = async () => {
        if (!publicKey || !connection || loading) return
        setLoading(true)
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        try {

            if (!publicKey || !connection) return
            setLoading(true)
            const positionsTemp: PoolPositionInfo[] = [];
            const allMints = new Set<string>();

            const userPositions = await cpAmm.getPositionsByUser(publicKey!)
            const poolAddresses = userPositions.map(x => x.positionState.pool);
            const allUserPoolStates = await cpAmm._program.account.pool.fetchMultiple(poolAddresses)
            const allPools = allUserPoolStates.map((x, i) => {
                if (x)
                    return {
                        publicKey: poolAddresses[i],
                        account: x,
                    }
            });
            const poolsMap = Object.fromEntries(allPools.map(x => [x!.publicKey.toBase58(), x!.account]))

            for (const userPosition of userPositions) {
                const pool = poolsMap[userPosition.positionState.pool.toBase58()]
                if (pool !== undefined) {

                    positionsTemp.push({
                        poolInfo: {
                            publicKey: userPosition.positionState.pool,
                            account: pool,
                        },

                        positionAddress: userPosition.position,
                        positionNftAccount: userPosition.positionNftAccount,
                        positionState: userPosition.positionState,
                        tokenA: {
                            mint: pool.tokenAMint.toString(),
                            tokenProgram: "",
                            symbol: 'Loading...',
                            name: 'Loading...',
                            poolAmount: 0,
                            poolValue: 0,
                            positionAmount: 0,
                            positionValue: 0,
                            decimals: 1,
                            unclaimedFeeAmount: 0,
                            unclaimedFeeUsd: 0,
                            claimedFeeAmount: 0,
                            isVerified: false,
                            price: new Decimal(0),
                            supply: 0,
                            lastUpdated: 0,
                        },
                        tokenB: {
                            mint: pool.tokenBMint.toString(),
                            tokenProgram: "",
                            symbol: 'Loading...',
                            name: 'Loading...',
                            poolAmount: 0,
                            poolValue: 0,
                            positionAmount: 0,
                            positionValue: 0,
                            decimals: 1,
                            unclaimedFeeAmount: 0,
                            unclaimedFeeUsd: 0,
                            claimedFeeAmount: 0,
                            isVerified: false,
                            price: new Decimal(0),
                            supply: 0,
                            lastUpdated: 0,
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
                        rateLimiter: null
                    })

                    allMints.add(pool.tokenAMint.toString())
                    allMints.add(pool.tokenBMint.toString())
                }
            };

            if (positionsTemp.length === 0) {
                setPositions([]);
                setUserLiquidity(undefined);
                setUserUnclaimedFees(undefined);
                setLoading(false);
                return;
            }

            // Set positions with loading state first
            //setPositions(positions)

            const mintAddresses = Array.from(allMints)

            // Fetch metadata and prices for all tokens
            const metadataMap = await fetchTokenMetadata(mintAddresses);
            const positionsParsed: PoolPositionInfo[] = [];
            for (const position of positionsTemp) {

                const tokenAMetadata = metadataMap[position.tokenA.mint];
                const tokenBMetadata = metadataMap[position.tokenB.mint];

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

                const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
                    liquidityDelta: positionLP,
                    sqrtPrice: position.poolInfo.account.sqrtPrice,
                    minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
                    maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
                });

                const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();
                const unclaimedRewards = getUnClaimLpFee(position.poolInfo.account, position.positionState);

                const tokenAUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const tokenBUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const tokenAClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const tokenBClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const poolPrice = getPriceFromSqrtPrice(position.poolInfo.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

                const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

                position.tokenA = {
                    ...tokenAMetadata,
                    poolAmount: poolTokenAAmount,
                    poolValue: tokenAMetadata.price.mul(poolTokenAAmount).toNumber(),
                    positionAmount: positionTokenAAmount,
                    positionValue: tokenBMetadata.price.mul(positionTokenAAmount * poolPrice).toNumber(),
                    unclaimedFeeAmount: tokenAUnclaimedFeesAmount,
                    unclaimedFeeUsd: poolPrice * tokenAUnclaimedFeesAmount * tokenBMetadata.price.toNumber(),
                    claimedFeeAmount: tokenAClaimedFeesAmount,
                }

                position.tokenB = {
                    ...tokenBMetadata,
                    poolAmount: poolTokenBAmount,
                    poolValue: tokenBMetadata.price.mul(poolTokenBAmount).toNumber(),
                    positionAmount: positionTokenBAmount,
                    positionValue: tokenBMetadata.price.mul(positionTokenBAmount).toNumber(),
                    unclaimedFeeAmount: tokenBUnclaimedFeesAmount,
                    unclaimedFeeUsd: tokenBUnclaimedFeesAmount * tokenBMetadata.price.toNumber(),
                    claimedFeeAmount: tokenBClaimedFeesAmount
                }
                position.poolValue = (poolTokenAAmount * poolPrice +
                    poolTokenBAmount) * tokenBMetadata!.price.toNumber();

                position.positionValue = (positionTokenAAmount * poolPrice +
                    positionTokenBAmount) * tokenBMetadata!.price.toNumber();;
                position.shareOfPoolPercentage = shareOfPool;

                position.positionUnclaimedFee = tokenAUnclaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                    tokenBUnclaimedFeesAmount * tokenBMetadata!.price.toNumber();;

                position.positionClaimedFee =
                    tokenAClaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                    tokenBClaimedFeesAmount * tokenBMetadata!.price.toNumber();

                const currentTimeInActivation = position.poolInfo.account.activationType === 0 ? getSlot() :
                    position.poolInfo.account.activationType === 1 ? currentTime : 0;
                const [minFee, currentFee] = getMinAndCurrentFee(position.poolInfo, currentTimeInActivation);
                position.poolMinFeeBPS = minFee;
                position.poolCurrentFeeBPS = currentFee;
                if (position.poolInfo.account.poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
                    position.rateLimiter = getRateLimiter(position.poolInfo, tokenBMetadata.decimals, currentTimeInActivation);
                }
                positionsParsed.push(position)
            };
            sortPositionsByInternal(positionsParsed, sortedBy, sortedAscending);
            updateLiquidity(positionsParsed);
            setLoading(false)


        } catch (err) {
            console.error('Failed to fetch positions:', err)
            setPositions([]);
            setUserLiquidity(undefined);
            setUserUnclaimedFees(undefined);
        }
        setLoading(false)
    }

    const updateLiquidity = (p: PoolPositionInfo[]) => {
        let totalLiquidity: TotalLiquidity = { totalUsdValue: 0, solAmount: 0, otherUsdValue: 0 }
        let totalFees: TotalLiquidity = { totalUsdValue: 0, solAmount: 0, otherUsdValue: 0 }
        p.forEach(x => {
            totalLiquidity.totalUsdValue += x.positionValue;
            if (x.tokenA.mint === NATIVE_MINT.toBase58())
                totalLiquidity.solAmount += x.tokenA.positionAmount;
            else
                totalLiquidity.otherUsdValue += x.tokenA.positionValue;

            if (x.tokenB.mint === NATIVE_MINT.toBase58())
                totalLiquidity.solAmount += x.tokenB.positionAmount;
            else
                totalLiquidity.otherUsdValue += x.tokenB.positionValue;

            totalFees.totalUsdValue += x.positionUnclaimedFee;

            if (x.tokenA.mint === NATIVE_MINT.toBase58())
                totalFees.solAmount += x.tokenA.unclaimedFeeAmount;
            else
                totalFees.otherUsdValue += x.tokenA.unclaimedFeeUsd;
            if (x.tokenB.mint === NATIVE_MINT.toBase58())
                totalFees.solAmount += x.tokenB.unclaimedFeeAmount;
            else
                totalFees.otherUsdValue += x.tokenB.unclaimedFeeUsd;
        });
        setUserLiquidity(totalLiquidity);
        setUserUnclaimedFees(totalFees);
    }

    const sortPositionsBy = (sortType: SortType, ascending?: boolean) => {

        setSortBy(sortType);
        setSortAscending(ascending);

        const p = positions.sort((x, y) => {
            if (ascending === null) {
                return (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
            }
            let r = 0;
            switch (sortType) {
                case SortType.PoolValue:
                    r = (x.poolValue - y.poolValue);
                    break;
                case SortType.PoolShare:
                    r = (x.shareOfPoolPercentage - y.shareOfPoolPercentage);
                    break;
                case SortType.PositionValue:
                    r = (x.positionValue - y.positionValue);
                    break;
                case SortType.PositionUnclaimedFee:
                    r = (x.positionUnclaimedFee - y.positionUnclaimedFee);
                    break;
                case SortType.PositionClaimedFee:
                    r = (x.positionClaimedFee - y.positionClaimedFee);
                    break;
                case SortType.PoolBaseFee:
                    r = (x.poolMinFeeBPS - y.poolMinFeeBPS);
                    break;
                case SortType.PoolCurrentFee:
                    r = (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
                    break;
                case SortType.PoolAge:
                    r = (x.poolInfo.account.activationPoint.sub(y.poolInfo.account.activationPoint).toNumber());
                    break;
            }

            if (!ascending)
                r = -r;
            return r;
        }
        )

        setPositions(p);
    }

    const sortPositionsByInternal = (pools: PoolPositionInfo[], sortType: SortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        const p = pools.sort((x, y) => {
            let r = 0;
            if (ascending === null) {
                return (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
            }
            switch (sortType) {
                case SortType.PoolValue:
                    r = (x.poolValue - y.poolValue);
                    break;
                case SortType.PoolShare:
                    r = (x.shareOfPoolPercentage - y.shareOfPoolPercentage);
                    break;
                case SortType.PositionValue:
                    r = (x.positionValue - y.positionValue);
                    break;
                case SortType.PositionUnclaimedFee:
                    r = (x.positionUnclaimedFee - y.positionUnclaimedFee);
                    break;
                case SortType.PositionClaimedFee:
                    r = (x.positionClaimedFee - y.positionClaimedFee);
                    break;
                case SortType.PoolBaseFee:
                    r = (x.poolMinFeeBPS - y.poolMinFeeBPS);
                    break;
                case SortType.PoolCurrentFee:
                    r = (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
                    break;
                case SortType.PoolAge:
                    r = (x.poolInfo.account.activationPoint.sub(y.poolInfo.account.activationPoint).toNumber());
                    break;
            }

            if (!ascending)
                r = -r;
            return r;
        })
        setPositions(p);
    }

    const updatePosition = async (positionAddress: PublicKey) => {
        const newPositions = [...positions];
        const position = newPositions.find(x => x.positionAddress === positionAddress);
        if (!position) return;

        position.positionState = await cpAmm.fetchPositionState(position.positionAddress);
        position.poolInfo.account = await cpAmm.fetchPoolState(position.poolInfo.publicKey);

        const metadataMap = await fetchTokenMetadata([position.tokenA.mint, position.tokenB.mint]);

        const tokenAMetadata = metadataMap[position.tokenA.mint];
        const tokenBMetadata = metadataMap[position.tokenB.mint];

        const positionLP = position.positionState.permanentLockedLiquidity.add(
            position.positionState.unlockedLiquidity).add(
                position.positionState.vestedLiquidity);

        const poolLP = position.poolInfo.account.liquidity;

        const withdrawPoolQuote = cpAmm!.getWithdrawQuote({
            liquidityDelta: poolLP,
            sqrtPrice: position.poolInfo.account.sqrtPrice,
            minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
            maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
        });

        const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
            liquidityDelta: positionLP,
            sqrtPrice: position.poolInfo.account.sqrtPrice,
            minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
            maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
        });

        const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const unclaimedRewards = getUnClaimLpFee(position.poolInfo.account, position.positionState);

        const tokenAUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const tokenBUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const tokenAClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const tokenBClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const poolPrice = getPriceFromSqrtPrice(position.poolInfo.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

        const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

        position.tokenA.poolAmount = poolTokenAAmount;
        position.tokenA.positionAmount = positionTokenAAmount;
        position.tokenA.unclaimedFeeAmount = tokenAUnclaimedFeesAmount;
        position.tokenA.unclaimedFeeUsd = poolPrice * tokenAUnclaimedFeesAmount / tokenBMetadata.price.toNumber();
        position.tokenA.claimedFeeAmount = tokenAClaimedFeesAmount;

        position.tokenB.poolAmount = poolTokenBAmount;
        position.tokenB.positionAmount = positionTokenBAmount;
        position.tokenB.unclaimedFeeAmount = tokenBUnclaimedFeesAmount;
        position.tokenB.unclaimedFeeUsd = tokenBUnclaimedFeesAmount / tokenBMetadata.price.toNumber();
        position.tokenB.claimedFeeAmount = tokenBClaimedFeesAmount;



        const newPoolValue = (poolTokenAAmount * poolPrice +
            poolTokenBAmount) * tokenBMetadata!.price.toNumber();
        position.poolValueChange = newPoolValue - position.poolValue;
        position.poolValue = newPoolValue;

        position.positionValue = positionTokenAAmount * tokenAMetadata!.price.toNumber() +
            positionTokenBAmount * tokenBMetadata!.price.toNumber();

        position.shareOfPoolPercentage = shareOfPool;
        position.positionUnclaimedFee =
            tokenAUnclaimedFeesAmount * tokenAMetadata!.price.toNumber() +
            tokenBUnclaimedFeesAmount * tokenBMetadata!.price.toNumber();
        position.positionClaimedFee =
            tokenAClaimedFeesAmount * tokenAMetadata!.price.toNumber() +
            tokenBClaimedFeesAmount * tokenBMetadata!.price.toNumber();

        const currentTimeInActivation = position.poolInfo.account.activationType === 0 ? getSlot() :
            position.poolInfo.account.activationType === 1 ? currentTime : 0;
        const [minFee, currentFee] = getMinAndCurrentFee(position.poolInfo, currentTimeInActivation);
        position.poolMinFeeBPS = minFee;
        position.poolCurrentFeeBPS = currentFee;
        if (position.poolInfo.account.poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
            position.rateLimiter = getRateLimiter(position.poolInfo, tokenBMetadata.decimals, currentTimeInActivation);
        }
        sortPositionsByInternal(newPositions, sortedBy, sortedAscending);
        updateLiquidity(newPositions);
        setPositions(newPositions);
    }

    const updatePositions = async (positionAddresses: PublicKey[]) => {
        if (positionAddresses.length === 0) return;
        const positionAddressMints = positionAddresses.map(x => x.toBase58());
        const updatingPositions = positions.filter(x => positionAddressMints.find(y => y === x.positionAddress.toBase58()))


        const updatedPositions = await cpAmm._program.account.position.fetchMultiple(updatingPositions.map(x => x.positionAddress))
        const updatedPools = await cpAmm._program.account.pool.fetchMultiple(updatingPositions.map(x => x.poolInfo.publicKey))
        for (const [index, pos] of updatingPositions.entries()) {
            pos.positionState = updatedPositions[index]!;
            pos.poolInfo.account = updatedPools[index]!
        }

        const metadataMap = await fetchTokenMetadata([...new Set([...updatingPositions.map(x => x.tokenA.mint), ...updatingPositions.map(x => x.tokenB.mint)])]);

        for (const position of updatingPositions) {
            const tokenAMetadata = metadataMap[position.tokenA.mint];
            const tokenBMetadata = metadataMap[position.tokenB.mint];

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

            const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
                liquidityDelta: positionLP,
                sqrtPrice: position.poolInfo.account.sqrtPrice,
                minSqrtPrice: position.poolInfo.account.sqrtMinPrice,
                maxSqrtPrice: position.poolInfo.account.sqrtMaxPrice,
            });

            const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const unclaimedRewards = getUnClaimLpFee(position.poolInfo.account, position.positionState);

            const tokenAUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBUnclaimedFeesAmount = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const tokenAClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const tokenBClaimedFeesAmount = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolPrice = getPriceFromSqrtPrice(position.poolInfo.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

            const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

            position.tokenA.poolAmount = poolTokenAAmount;
            position.tokenA.positionAmount = positionTokenAAmount;
            position.tokenA.unclaimedFeeAmount = tokenAUnclaimedFeesAmount;
            position.tokenA.unclaimedFeeUsd = poolPrice * tokenAUnclaimedFeesAmount / tokenBMetadata.price.toNumber();
            position.tokenA.claimedFeeAmount = tokenAClaimedFeesAmount;

            position.tokenB.poolAmount = poolTokenBAmount;
            position.tokenB.positionAmount = positionTokenBAmount;
            position.tokenB.unclaimedFeeAmount = tokenBUnclaimedFeesAmount;
            position.tokenB.unclaimedFeeUsd = tokenBUnclaimedFeesAmount / tokenBMetadata.price.toNumber();
            position.tokenB.claimedFeeAmount = tokenBClaimedFeesAmount;

            const newPoolValue = (poolTokenAAmount * poolPrice +
                poolTokenBAmount) * tokenBMetadata!.price.toNumber();
            position.poolValueChange = newPoolValue - position.poolValue;
            position.poolValue = newPoolValue;

            const newPositionValue = (positionTokenAAmount * poolPrice +
                positionTokenBAmount) * tokenBMetadata!.price.toNumber();
            position.positionValueChange = newPositionValue - position.positionValue;
            position.positionValue = newPositionValue;

            position.shareOfPoolPercentage = shareOfPool;

            const positionUnclaimedFeeChange =
                tokenAUnclaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                tokenBUnclaimedFeesAmount * tokenBMetadata!.price.toNumber();
            position.positionUnclaimedFeeChange =
                positionUnclaimedFeeChange - position.positionUnclaimedFee;
            position.positionUnclaimedFee = positionUnclaimedFeeChange;

            position.positionClaimedFee =
                tokenAClaimedFeesAmount * tokenAMetadata!.price.toNumber() +
                tokenBClaimedFeesAmount * tokenBMetadata!.price.toNumber();

            const currentTimeInActivation = position.poolInfo.account.activationType === 0 ? getSlot() :
                position.poolInfo.account.activationType === 1 ? currentTime : 0;

                position.poolInfo.account.poolFees.baseFee.cliffFeeNumerator
            const [minFee, currentFee] = getMinAndCurrentFee(position.poolInfo, currentTimeInActivation);
            position.poolMinFeeBPS = minFee;
            position.poolCurrentFeeBPS = currentFee;
            if (position.poolInfo.account.poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
                position.rateLimiter = getRateLimiter(position.poolInfo, tokenBMetadata.decimals, currentTimeInActivation);
            }
            sortPositionsByInternal(positions, sortedBy, sortedAscending);
            updateLiquidity(positions);
            setPositions(positions);
        }
    }

    const removePosition = (positionAddress: PublicKey) => {
        const updatedPositions = positions.filter(x => x.positionAddress !== positionAddress);
        setPositions(updatedPositions);
        updateLiquidity(updatedPositions);
    }

    const removeLiquidityAndSwapToQuote = async (position: PoolPositionInfo): Promise<boolean> => {
        const txn = await cpAmm.removeAllLiquidityAndClosePosition({
            owner: publicKey!,
            position: position.positionAddress,
            positionNftAccount: position.positionNftAccount,
            positionState: position.positionState,
            poolState: position.poolInfo.account,
            tokenAAmountThreshold: new BN(0),
            tokenBAmountThreshold: new BN(0),
            vestings: [],
            currentPoint: new BN(0),
        });
        let closed = false;

        const t = new Transaction();
        t.add(...txn.instructions);


        try {
            await sendTxn(txn.instructions, 10000, undefined, undefined, {
                notify: true,
                onSuccess: () => {
                    removePosition(position.positionAddress);
                    closed = true;
                }
            })

        } catch (e) {
            console.log(e);
        }

        if (closed) {
            const { tokenAccounts } = await refreshTokenAccounts();
            const tokenAAccount = tokenAccounts.find(x => x.mint == position.tokenA.mint);
            if (!tokenAAccount) {
                txToast.error("Could not find token account");
                return false;
            }
            const quote = await getQuote({
                inputMint: position.tokenA.mint,
                outputMint: position.tokenB.mint,

                amount: new Decimal(tokenAAccount.amount).mul(Decimal.pow(10, tokenAAccount.decimals)),
                slippageBps: 1000,
            }, false);

            const transaction = await getSwapTransactionVersioned(quote, publicKey!);

            await sendVersionedTxn(transaction, {
                notify: true,
                onError: () => {
                    txToast.error("Swap failed");
                    return false;
                },
                onSuccess: async (x) => {
                    txToast.success("Swap successful", x);
                }
            });
        } return true;
    }
    useEffect(() => {
        refreshPositions();
        console.log("refreshing positions from context")
    }, [connection, publicKey])

    useEffect(() => {
        if (updatedPools && updatedPools.length > 0) {
            const positionsSet = new Set<PoolPositionInfo>();

            const pools: {
                [key: string]: PoolPositionInfo[]
            } = {};
            for (const pos of positions) {
                if (!pools[pos.poolInfo.publicKey.toBase58()])
                    pools[pos.poolInfo.publicKey.toBase58()] = [];
                pools[pos.poolInfo.publicKey.toBase58()].push(pos);
            }

            for (const updated of updatedPools)
                if (pools[updated.publicKey.toBase58()])
                    for (const f of pools[updated.publicKey.toBase58()])
                        positionsSet.add(f)

            updatePositions([...positionsSet].map(x => x.positionAddress))

        }
    }, [updatedPools])
    return (
        <DammUserPositionsContext.Provider value={{
            positions, userLiquidity, userUnclaimedFees: userUnclaimedFees, loading,
            refreshPositions, sortPositionsBy, updatePosition, removePosition, removeLiquidityAndSwapToQuote, sortedBy, sortedAscending,
        }}>
            {children}
        </DammUserPositionsContext.Provider>
    )
}
