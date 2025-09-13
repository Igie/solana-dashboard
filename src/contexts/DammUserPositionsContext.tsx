import React, { createContext, useContext, useState } from 'react'
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js'
import { feeNumeratorToBps, getAmountAFromLiquidityDelta, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice, getTokenProgram, getUnClaimReward, Rounding } from '@meteora-ag/cp-amm-sdk'
import { fetchTokenMetadataJup } from '../tokenUtils'
import Decimal from 'decimal.js'
import { BN } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { useTransactionManager } from './TransactionManagerContext';
import { txToast } from '../components/Simple/TxToast';
import { getQuote, getSwapTransactionVersioned } from '../JupSwapApi'
import { useTokenAccounts } from './TokenAccountsContext'
import { useCpAmm } from './CpAmmContext'
import { getJupiterSwapInstruction } from "@meteora-ag/zap-sdk"
import { useSettings } from './SettingsContext'
import type { PoolPositionInfo, PoolPositionInfoMap } from '../constants'
import { useGetSlot } from './GetSlotContext'



export const getPoolPositionMap = (poolPositions: PoolPositionInfo[]): PoolPositionInfoMap => {
    const poolPositionMap: PoolPositionInfoMap = {}
    poolPositions.map((x) => {
        poolPositionMap[x.poolAddress.toBase58()] = x;
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
}

interface DammUserPositionsContextType {
    positions: PoolPositionInfo[]
    totalLiquidityValue: number // Total USD value of all positions
    loading: boolean
    refreshPositions: () => Promise<void>
    sortPositionsBy: (sortType: SortType, ascending?: boolean) => void
    updatePosition: (positionAddress: PublicKey) => void
    removePosition: (positionAddress: PublicKey) => void
    removeLiquidityAndSwapToQuote: (position: PoolPositionInfo) => void
    getZapOutTx: (positions: PoolPositionInfo[]) => Promise<Transaction[]>
    zapOutProgress: string,
    sortedBy: SortType,
    sortedAscending: boolean | undefined,
}

const DammUserPositionsContext = createContext<DammUserPositionsContextType>({
    positions: [],
    totalLiquidityValue: 0,
    loading: false,
    refreshPositions: async () => { },

    sortPositionsBy: (_sortType: SortType, _ascending?: boolean) => { },
    updatePosition: async (_positionAddress: PublicKey) => { },
    removePosition: (_positionAddress: PublicKey) => { },
    removeLiquidityAndSwapToQuote: (_position: PoolPositionInfo) => { },
    getZapOutTx: async (_positions: PoolPositionInfo[]) => [],
    zapOutProgress: "",
    sortedBy: SortType.PoolValue,
    sortedAscending: true,
})

export const useDammUserPositions = () => useContext(DammUserPositionsContext)

export const DammUserPositionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { jupZapOutSlippage, includeDammv2Route } = useSettings();
    const { connection } = useConnection();
    const { getSlot } = useGetSlot();
    const { publicKey } = useWallet();
    const { sendTxn } = useTransactionManager();
    const { cpAmm, zap } = useCpAmm();
    const { refreshTokenAccounts } = useTokenAccounts();
    const [sortedBy, setSortBy] = useState<SortType>(SortType.PoolBaseFee);
    const [sortedAscending, setSortAscending] = useState<boolean | undefined>(true);
    const [positions, setPositions] = useState<PoolPositionInfo[]>([])
    const [totalLiquidityValue, setTotalLiquidityValue] = useState<number>(0)

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
                        poolAddress: userPosition.positionState.pool,
                        positionAddress: userPosition.position,
                        positionNftAccount: userPosition.positionNftAccount,
                        poolState: pool,
                        positionState: userPosition.positionState,
                        tokenA: {
                            mint: pool.tokenAMint.toString(),
                            tokenProgram: "",
                            symbol: 'Loading...',
                            name: 'Loading...',
                            poolAmount: 0,
                            positionAmount: 0,
                            decimals: 1,
                            unclaimedFee: 0,
                            claimedFee: 0,
                            isVerified: false,
                            price: new Decimal(0),
                            supply: 0
                        },
                        tokenB: {
                            mint: pool.tokenBMint.toString(),
                            tokenProgram: "",
                            symbol: 'Loading...',
                            name: 'Loading...',
                            poolAmount: 0,
                            positionAmount: 0,
                            decimals: 1,
                            unclaimedFee: 0,
                            claimedFee: 0,
                            isVerified: false,
                            price: new Decimal(0),
                            supply: 0
                        },
                        shareOfPoolPercentage: 0.5,
                        poolValue: 0,
                        positionValue: 0,
                        positionUnclaimedFee: 0,
                        positionClaimedFee: 0,
                        poolBaseFeeBPS: 0,
                        poolCurrentFeeBPS: 0,
                    })

                    allMints.add(pool.tokenAMint.toString())
                    allMints.add(pool.tokenBMint.toString())
                }
            };

            if (positionsTemp.length === 0) {
                setPositions([]);
                setTotalLiquidityValue(0);
                setLoading(false);
                return;
            }

            // Set positions with loading state first
            //setPositions(positions)

            const mintAddresses = Array.from(allMints)

            // Fetch metadata and prices for all tokens
            const metadataMap = await fetchTokenMetadataJup(mintAddresses);
            const positionsParsed: PoolPositionInfo[] = [];
            for (const position of positionsTemp) {

                const tokenAMetadata = metadataMap[position.tokenA.mint];
                const tokenBMetadata = metadataMap[position.tokenB.mint];

                const positionLP = position.positionState.permanentLockedLiquidity.add(
                    position.positionState.unlockedLiquidity).add(
                        position.positionState.vestedLiquidity)

                const poolLP = position.poolState.liquidity;

                const withdrawPoolQuote = cpAmm!.getWithdrawQuote({
                    liquidityDelta: poolLP,
                    sqrtPrice: position.poolState.sqrtPrice,
                    minSqrtPrice: position.poolState.sqrtMinPrice,
                    maxSqrtPrice: position.poolState.sqrtMaxPrice,
                });

                const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
                    liquidityDelta: positionLP,
                    sqrtPrice: position.poolState.sqrtPrice,
                    minSqrtPrice: position.poolState.sqrtMinPrice,
                    maxSqrtPrice: position.poolState.sqrtMaxPrice,
                });

                const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const unclaimedRewards = getUnClaimReward(position.poolState, position.positionState);

                const tokenAUnclaimedFees = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const tokenBUnclaimedFees = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();
                const tokenAClaimedFees = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const tokenBClaimedFees = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();


                const poolPrice = getPriceFromSqrtPrice(position.poolState.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals).toNumber();

                const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

                position.tokenA = {
                    ...tokenAMetadata,
                    poolAmount: poolTokenAAmount,
                    positionAmount: positionTokenAAmount,
                    unclaimedFee: tokenAUnclaimedFees,
                    claimedFee: tokenAClaimedFees
                }

                position.tokenB = {
                    ...tokenBMetadata,
                    poolAmount: poolTokenBAmount,
                    positionAmount: positionTokenBAmount,
                    unclaimedFee: tokenBUnclaimedFees,
                    claimedFee: tokenBClaimedFees
                }

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
                    position.poolState.poolFees.baseFee.feeSchedulerMode,
                    position.poolState.poolFees.baseFee.cliffFeeNumerator,
                    new BN(position.poolState.poolFees.baseFee.numberOfPeriod),
                    position.poolState.poolFees.baseFee.reductionFactor));

                position.poolCurrentFeeBPS = feeNumeratorToBps(getFeeNumerator(
                    position.poolState.activationType === 0 ? getSlot() :
                        position.poolState.activationType === 1 ? currentTime : 0,
                    position.poolState.activationPoint,
                    position.poolState.poolFees.baseFee.numberOfPeriod,
                    position.poolState.poolFees.baseFee.periodFrequency,
                    position.poolState.poolFees.baseFee.feeSchedulerMode,
                    position.poolState.poolFees.baseFee.cliffFeeNumerator,
                    position.poolState.poolFees.baseFee.reductionFactor,
                    position.poolState.poolFees.dynamicFee
                ));
                positionsParsed.push(position)
            };
            sortPositionsByInternal(positionsParsed, sortedBy, sortedAscending);

            let totalLiquidity: number = 0;
            let totalFees: number = 0

            positionsParsed.forEach(x => {
                totalLiquidity += x.positionValue;
                totalFees += x.positionUnclaimedFee;
            });

            setTotalLiquidityValue(totalLiquidity);

            setLoading(false)


        } catch (err) {
            console.error('Failed to fetch positions:', err)
            setPositions([]);
            setTotalLiquidityValue(0);
        }
        setLoading(false)
    }

    const updateLiquidity = (p: PoolPositionInfo[]) => {
        let totalLiquidity: number = 0;
        p.forEach(x => {
            totalLiquidity += x.positionValue;
        });
        setTotalLiquidityValue(totalLiquidity);
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
                    r = (x.poolBaseFeeBPS - y.poolBaseFeeBPS);
                    break;
                case SortType.PoolCurrentFee:
                    r = (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
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
        if (sortType === SortType.PositionClaimedFee)
            console.log(pools.map(x => x.positionClaimedFee))
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
                    r = (x.poolBaseFeeBPS - y.poolBaseFeeBPS);
                    break;
                case SortType.PoolCurrentFee:
                    r = (x.poolCurrentFeeBPS - y.poolCurrentFeeBPS);
                    break;
            }

            if (!ascending)
                r = -r;
            return r;
        }
        )

        setPositions(p);
    }

    const updatePosition = async (positionAddress: PublicKey) => {
        const newPositions = [...positions];
        const position = newPositions.find(x => x.positionAddress === positionAddress);
        if (!position) return;

        position.positionState = await cpAmm.fetchPositionState(position.positionAddress);
        position.poolState = await cpAmm.fetchPoolState(position.poolAddress);

        const metadataMap = await fetchTokenMetadataJup([position.tokenA.mint, position.tokenB.mint]);

        const tokenAMetadata = metadataMap[position.tokenA.mint];
        const tokenBMetadata = metadataMap[position.tokenB.mint];

        const positionLP = position.positionState.permanentLockedLiquidity.add(
            position.positionState.unlockedLiquidity).add(
                position.positionState.vestedLiquidity)

        const poolLP = position.poolState.liquidity;

        const withdrawPoolQuote = cpAmm!.getWithdrawQuote({
            liquidityDelta: poolLP,
            sqrtPrice: position.poolState.sqrtPrice,
            minSqrtPrice: position.poolState.sqrtMinPrice,
            maxSqrtPrice: position.poolState.sqrtMaxPrice,
        });

        const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const withdrawPositionQuote = cpAmm!.getWithdrawQuote({
            liquidityDelta: positionLP,
            sqrtPrice: position.poolState.sqrtPrice,
            minSqrtPrice: position.poolState.sqrtMinPrice,
            maxSqrtPrice: position.poolState.sqrtMaxPrice,
        });

        const positionTokenAAmount = new Decimal(withdrawPositionQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const positionTokenBAmount = new Decimal(withdrawPositionQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const unclaimedRewards = getUnClaimReward(position.poolState, position.positionState);

        const tokenAUnclaimedFees = new Decimal(unclaimedRewards.feeTokenA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const tokenBUnclaimedFees = new Decimal(unclaimedRewards.feeTokenB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();
        const tokenAClaimedFees = new Decimal(position.positionState.metrics.totalClaimedAFee.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
        const tokenBClaimedFees = new Decimal(position.positionState.metrics.totalClaimedBFee.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

        const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

        position.tokenA.poolAmount = poolTokenAAmount;
        position.tokenA.positionAmount = positionTokenAAmount;
        position.tokenA.unclaimedFee = tokenAUnclaimedFees;
        position.tokenA.claimedFee = tokenAClaimedFees;

        position.tokenB.poolAmount = poolTokenBAmount;
        position.tokenB.positionAmount = positionTokenBAmount;
        position.tokenB.unclaimedFee = tokenBUnclaimedFees;
        position.tokenB.claimedFee = tokenBClaimedFees;

        position.poolValue = poolTokenAAmount * tokenAMetadata!.price.toNumber() +
            poolTokenBAmount * tokenBMetadata!.price.toNumber();
        position.positionValue = positionTokenAAmount * tokenAMetadata!.price.toNumber() +
            positionTokenBAmount * tokenBMetadata!.price.toNumber();
        position.shareOfPoolPercentage = shareOfPool;
        position.positionUnclaimedFee =
            tokenAUnclaimedFees * tokenAMetadata!.price.toNumber() +
            tokenBUnclaimedFees * tokenBMetadata!.price.toNumber();
        position.positionClaimedFee =
            tokenAClaimedFees * tokenAMetadata!.price.toNumber() +
            tokenBClaimedFees * tokenBMetadata!.price.toNumber();

        position.poolBaseFeeBPS = feeNumeratorToBps(getBaseFeeNumerator(
            position.poolState.poolFees.baseFee.feeSchedulerMode,
            position.poolState.poolFees.baseFee.cliffFeeNumerator,
            new BN(position.poolState.poolFees.baseFee.numberOfPeriod),
            position.poolState.poolFees.baseFee.reductionFactor));

        position.poolCurrentFeeBPS = feeNumeratorToBps(getFeeNumerator(
            position.poolState.activationType === 0 ? getSlot() :
                position.poolState.activationType === 1 ? currentTime : 0,
            position.poolState.activationPoint,
            position.poolState.poolFees.baseFee.numberOfPeriod,
            position.poolState.poolFees.baseFee.periodFrequency,
            position.poolState.poolFees.baseFee.feeSchedulerMode,
            position.poolState.poolFees.baseFee.cliffFeeNumerator,
            position.poolState.poolFees.baseFee.reductionFactor,
            position.poolState.poolFees.dynamicFee
        ));
        setPositions(newPositions);
    }

    const removePosition = (positionAddress: PublicKey) => {
        const updatedPositions = positions.filter(x => x.positionAddress !== positionAddress);
        setPositions(updatedPositions);
        updateLiquidity(updatedPositions);
    }

    const removeLiquidityAndSwapToQuote = async (position: PoolPositionInfo): Promise<boolean> => {

        //const success = await zapOut(position);
        //if (success) {
        //    return true;
        //}
        console.log("Falling back to simple remove liquidity and swap");
        txToast.error("Remove liquidity and swap failed. Falling back to simple remove and swap.");

        const txn = await cpAmm.removeAllLiquidityAndClosePosition({
            owner: publicKey!,
            position: position.positionAddress,
            positionNftAccount: position.positionNftAccount,
            positionState: position.positionState,
            poolState: position.poolState,
            tokenAAmountThreshold: new BN(position.tokenA.positionAmount * (10 ** position.tokenA.decimals)).muln(0.9),
            tokenBAmountThreshold: new BN(position.tokenB.positionAmount * (10 ** position.tokenB.decimals)).muln(0.9),
            vestings: [],
            currentPoint: new BN(0),
        });

        let closed = false;
        try {
            await sendTxn(txn, undefined, {
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

            await sendTxn(transaction, undefined, {
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

    const [zapOutProgress, setZapOutProgress] = useState("");

    const getZapOutTx = async (positions: PoolPositionInfo[]): Promise<Transaction[]> => {
        const currentTime = await connection.getBlockTime(getSlot());
        const txns = [];

        let count = 1;
        for (const position of positions) {
            setZapOutProgress(`${count} of ${positions.length}`);
            count++;
            position.positionState = await cpAmm.fetchPositionState(position.positionAddress);

            try {
                const liquidityDelta =
                    position.positionState.unlockedLiquidity; // remove liquidity with too small amount

                const inputMint = position.poolState.tokenAMint;
                const outputMint = position.poolState.tokenBMint;
                const inputTokenProgram = getTokenProgram(position.poolState.tokenAFlag);
                const outputTokenProgram = getTokenProgram(position.poolState.tokenBFlag);
                const amountARemoved = getAmountAFromLiquidityDelta(
                    liquidityDelta,
                    position.poolState.sqrtPrice,
                    position.poolState.sqrtMaxPrice,
                    Rounding.Down
                );

                let transaction = new Transaction();
                transaction.feePayer = publicKey!;

                let removeLiquidityTx = await cpAmm.removeAllLiquidityAndClosePosition({
                    owner: publicKey!,
                    position: position.positionAddress,
                    positionNftAccount: position.positionNftAccount,
                    positionState: position.positionState,
                    poolState: position.poolState,
                    tokenAAmountThreshold: new BN(0),
                    tokenBAmountThreshold: new BN(0),
                    vestings: [],
                    currentPoint: new BN(0),
                });

                transaction.add(removeLiquidityTx);

                let dammV2Quote = null;
                let jupiterQuote = null;
                try {
                    dammV2Quote = cpAmm.getQuote({
                        inAmount: amountARemoved,
                        inputTokenMint: inputMint,
                        slippage: 0.5,
                        poolState: position.poolState,
                        currentTime: currentTime ?? 0,
                        currentSlot: getSlot(),
                        tokenADecimal: position.tokenA.decimals,
                        tokenBDecimal: position.tokenB.decimals,
                    });
                } catch { }


                try {
                    jupiterQuote = await getQuote({
                        inputMint: inputMint.toBase58(),
                        outputMint: outputMint.toBase58(),
                        amount: new Decimal(amountARemoved.toString()),
                        maxAccounts: 10,
                        onlyDirectRoutes: true,
                        slippageBps: jupZapOutSlippage ? jupZapOutSlippage * 100 : 2000,
                        excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
                    }, false);
                } catch { };

                const quotes = {
                    dammV2: dammV2Quote,
                    jupiter: jupiterQuote,
                };

                if (quotes.dammV2) {
                    console.log("DAMM v2 quote:", quotes.dammV2.swapOutAmount.toString());
                }

                if (quotes.jupiter) {
                    console.log("Jupiter quote:", quotes.jupiter.outAmount.toString());
                }

                let bestQuoteValue: BN | null = null;
                let bestProtocol: string | null = null;

                if (quotes.dammV2?.swapOutAmount) {
                    bestQuoteValue = quotes.dammV2.swapOutAmount;
                    bestProtocol = "dammV2";
                }

                if (quotes.jupiter?.outAmount) {
                    const jupiterAmount = new BN(quotes.jupiter.outAmount);
                    if (!bestQuoteValue || jupiterAmount.gt(bestQuoteValue)) {
                        bestQuoteValue = jupiterAmount;
                        bestProtocol = "jupiter";
                    }
                }

                if (!bestProtocol || !bestQuoteValue) {
                    console.error("No valid quotes obtained from any protocol");
                    continue;
                }

                console.log(
                    `Best protocol: ${bestProtocol} with quote:`,
                    bestQuoteValue.toString()
                );

                let zapOutTx;
                if (bestProtocol === "dammV2") {
                    zapOutTx = await zap.zapOutThroughDammV2({
                        user: publicKey!,
                        poolAddress: position.poolAddress,
                        inputMint,
                        outputMint,
                        inputTokenProgram: inputTokenProgram,
                        outputTokenProgram: outputTokenProgram,
                        amountIn: amountARemoved,
                        minimumSwapAmountOut: new BN(0),
                        maxSwapAmount: amountARemoved,
                        percentageToZapOut: 100,
                    });
                } else if (bestProtocol === "jupiter" && quotes.jupiter) {

                    const swapInstructionResponse = await getJupiterSwapInstruction(
                        publicKey!,
                        quotes.jupiter,
                    );

                    console.log("Jupiter swap response:", swapInstructionResponse);

                    try {
                        zapOutTx = await zap.zapOutThroughJupiter({
                            user: publicKey!,
                            inputMint,
                            outputMint,
                            inputTokenProgram,
                            outputTokenProgram,
                            jupiterSwapResponse: swapInstructionResponse,
                            maxSwapAmount: new BN(quotes.jupiter.inAmount),
                            percentageToZapOut: 100,
                        });
                    } catch { continue; }
                } else {
                    console.error(`Invalid protocol selected: ${bestProtocol}`);
                }

                transaction.add(zapOutTx!);
                let res = null;
                try {
                    res = await connection.simulateTransaction(transaction)
                } catch {
                    continue;
                }

                console.log("First sim:", res);

                if (!res || res.value.err) {
                    console.log("Zap out failed simulation!");
                    if (bestProtocol === "dammV2" && quotes.jupiter) {
                        console.log("Retrying with Jupiter");
                        transaction = new Transaction();
                        transaction.feePayer = publicKey!;
                        transaction.add(removeLiquidityTx);
                        const swapInstructionResponse = await getJupiterSwapInstruction(
                            publicKey!,
                            quotes.jupiter,
                        );
                        console.log("Jupiter swap response:", swapInstructionResponse);
                        try {
                            zapOutTx = await zap.zapOutThroughJupiter({
                                user: publicKey!,
                                inputMint,
                                outputMint,
                                inputTokenProgram,
                                outputTokenProgram,
                                jupiterSwapResponse: swapInstructionResponse,
                                maxSwapAmount: new BN(quotes.jupiter.inAmount),
                                percentageToZapOut: 100,
                            });
                        } catch { continue; }
                        transaction.add(zapOutTx!);

                        res = await connection.simulateTransaction(transaction);
                        console.log("Second sim:", res);

                        if (res.value.err) {
                            console.log("Simulation failed with Jupiter as well, aborting.");
                            continue;
                        } else {
                            console.log("Simulation success with Jupiter, proceeding to send.");
                        }
                    } else {
                        continue;
                    }
                }

                transaction.instructions = [
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
                    ComputeBudgetProgram.setComputeUnitLimit({ units: res.value.unitsConsumed! * 1.2 }),
                    ...transaction.instructions
                ];

                txns.push(transaction);
            } catch { }
        }
        setZapOutProgress("")
        return txns;
    }

    // const zapOut = async (position: PoolPositionInfo): Promise<boolean> => {
    //     const currentTime = await connection.getBlockTime(currentSlot);

    //     position.positionState = await cpAmm.fetchPositionState(position.positionAddress);

    //     const liquidityDelta =
    //         position.positionState.unlockedLiquidity; // remove liquidity with too small amount

    //     const inputMint = position.poolState.tokenAMint;
    //     const outputMint = position.poolState.tokenBMint;
    //     const inputTokenProgram = getTokenProgram(position.poolState.tokenAFlag);
    //     const outputTokenProgram = getTokenProgram(position.poolState.tokenBFlag);
    //     const amountARemoved = getAmountAFromLiquidityDelta(
    //         liquidityDelta,
    //         position.poolState.sqrtPrice,
    //         position.poolState.sqrtMaxPrice,
    //         Rounding.Down
    //     );

    //     let transaction = new Transaction();
    //     transaction.feePayer = publicKey!;

    //     let removeLiquidityTx = await cpAmm.removeAllLiquidityAndClosePosition({
    //         owner: publicKey!,
    //         position: position.positionAddress,
    //         positionNftAccount: position.positionNftAccount,
    //         positionState: position.positionState,
    //         poolState: position.poolState,
    //         tokenAAmountThreshold: new BN(0),
    //         tokenBAmountThreshold: new BN(0),
    //         vestings: [],
    //         currentPoint: new BN(0),
    //     });

    //     transaction.add(removeLiquidityTx);

    //     let dammV2Quote = null;
    //     let jupiterQuote = null;
    //     try {
    //         dammV2Quote = cpAmm.getQuote({
    //             inAmount: amountARemoved,
    //             inputTokenMint: inputMint,
    //             slippage: 0.5,
    //             poolState: position.poolState,
    //             currentTime: currentTime ?? 0,
    //             currentSlot,
    //             tokenADecimal: position.tokenA.decimals,
    //             tokenBDecimal: position.tokenB.decimals,
    //         });
    //     } catch { }


    //     try {
    //         jupiterQuote = await getQuote({
    //             inputMint: inputMint.toBase58(),
    //             outputMint: outputMint.toBase58(),
    //             amount: new Decimal(amountARemoved.toString()),
    //             maxAccounts: 10,
    //             onlyDirectRoutes: true,
    //             slippageBps: jupZapOutSlippage ? jupZapOutSlippage * 100 : 2000,
    //             excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
    //         });
    //     } catch { };

    //     const quotes = {
    //         dammV2: dammV2Quote,
    //         jupiter: jupiterQuote,
    //     };

    //     if (quotes.dammV2) {
    //         console.log("DAMM v2 quote:", quotes.dammV2.swapOutAmount.toString());
    //     }

    //     if (quotes.jupiter) {
    //         console.log("Jupiter quote:", quotes.jupiter.outAmount.toString());
    //     }

    //     let bestQuoteValue: BN | null = null;
    //     let bestProtocol: string | null = null;

    //     if (quotes.dammV2?.swapOutAmount) {
    //         bestQuoteValue = quotes.dammV2.swapOutAmount;
    //         bestProtocol = "dammV2";
    //     }

    //     if (quotes.jupiter?.outAmount) {
    //         const jupiterAmount = new BN(quotes.jupiter.outAmount);
    //         if (!bestQuoteValue || jupiterAmount.gt(bestQuoteValue)) {
    //             bestQuoteValue = jupiterAmount;
    //             bestProtocol = "jupiter";
    //         }
    //     }

    //     if (!bestProtocol || !bestQuoteValue) {
    //         console.error("No valid quotes obtained from any protocol");
    //         return false;
    //     }

    //     console.log(
    //         `Best protocol: ${bestProtocol} with quote:`,
    //         bestQuoteValue.toString()
    //     );

    //     let zapOutTx;
    //     if (bestProtocol === "dammV2") {
    //         zapOutTx = await zap.zapOutThroughDammV2({
    //             user: publicKey!,
    //             poolAddress: position.poolAddress,
    //             inputMint,
    //             outputMint,
    //             inputTokenProgram: inputTokenProgram,
    //             outputTokenProgram: outputTokenProgram,
    //             amountIn: amountARemoved,
    //             minimumSwapAmountOut: new BN(0),
    //             maxSwapAmount: amountARemoved,
    //             percentageToZapOut: 100,
    //         });
    //     } else if (bestProtocol === "jupiter" && quotes.jupiter) {

    //         const swapInstructionResponse = await getJupiterSwapInstruction(
    //             publicKey!,
    //             quotes.jupiter,
    //         );

    //         console.log("Jupiter swap response:", swapInstructionResponse);

    //         zapOutTx = await zap.zapOutThroughJupiter({
    //             user: publicKey!,
    //             inputMint,
    //             outputMint,
    //             inputTokenProgram,
    //             outputTokenProgram,
    //             jupiterSwapResponse: swapInstructionResponse,
    //             maxSwapAmount: new BN(quotes.jupiter.inAmount),
    //             percentageToZapOut: 100,
    //         });
    //     } else {
    //         txToast.error(`Failed to create zap out transaction  + ${bestProtocol}`);
    //         console.error(`Invalid protocol selected: ${bestProtocol}`);
    //     }

    //     transaction.add(zapOutTx!);
    //     let res = await connection.simulateTransaction(transaction)

    //     console.log("First sim:", res);

    //     if (res.value.err) {
    //         console.log("Zap out failed simulation!");
    //         if (bestProtocol === "dammV2" && quotes.jupiter) {
    //             console.log("Retrying with Jupiter");
    //             transaction = new Transaction();
    //             transaction.feePayer = publicKey!;
    //             transaction.add(removeLiquidityTx);
    //             const swapInstructionResponse = await getJupiterSwapInstruction(
    //                 publicKey!,
    //                 quotes.jupiter,
    //             );
    //             console.log("Jupiter swap response:", swapInstructionResponse);
    //             zapOutTx = await zap.zapOutThroughJupiter({
    //                 user: publicKey!,
    //                 inputMint,
    //                 outputMint,
    //                 inputTokenProgram,
    //                 outputTokenProgram,
    //                 jupiterSwapResponse: swapInstructionResponse,
    //                 maxSwapAmount: new BN(quotes.jupiter.inAmount),
    //                 percentageToZapOut: 100,
    //             });
    //             transaction.add(zapOutTx!);

    //             res = await connection.simulateTransaction(transaction);
    //             console.log("Second sim:", res);

    //             if (res.value.err) {
    //                 console.log("Simulation failed with Jupiter as well, aborting.");
    //                 txToast.error("Zap out failed! Both DAMM v2 and Jupiter simulations failed!");
    //                 return false;
    //             } else {
    //                 console.log("Simulation success with Jupiter, proceeding to send.");
    //             }
    //         } else {
    //             txToast.error("Zap out failed! No Jupiter quote!");
    //             return false;
    //         }
    //     }

    //     transaction.instructions = [
    //         ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
    //         ComputeBudgetProgram.setComputeUnitLimit({ units: res.value.unitsConsumed! * 1.2 }),
    //         ...transaction.instructions
    //     ];

    //     await sendTxn(transaction, undefined, {
    //         notify: true,
    //         onError: () => {
    //             txToast.error("Zap Out failed!");
    //             return false;
    //         },
    //         onSuccess: async (x) => {
    //             txToast.success("Zap out successful!", x);
    //             removePosition(position.positionAddress);
    //             return true;
    //         }
    //     });
    //     return false;
    // }

    return (
        <DammUserPositionsContext.Provider value={{
            positions, totalLiquidityValue, loading,
            refreshPositions, sortPositionsBy, updatePosition, removePosition, removeLiquidityAndSwapToQuote, getZapOutTx, zapOutProgress, sortedBy, sortedAscending,
        }}>
            {children}
        </DammUserPositionsContext.Provider>
    )
}
