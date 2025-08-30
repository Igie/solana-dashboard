import React, { createContext, useContext, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { CpAmm, feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getUnClaimReward, type PoolState, type PositionState } from '@meteora-ag/cp-amm-sdk'
import { fetchTokenMetadataJup } from '../tokenUtils'
import Decimal from 'decimal.js'
import { BN } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { useTransactionManager } from './TransactionManagerContext';
import { txToast } from '../components/Simple/TxToast';
import { getQuote, getSwapTransactionVersioned } from '../JupSwapApi'
import { useTokenAccounts } from './TokenAccountsContext'

export interface PoolTokenInfo {
    mint: string
    tokenProgram: string
    symbol: string
    name: string
    poolAmount: number
    positionAmount: number
    decimals: number
    image?: string
    unclaimedFee: number
}

export interface PoolPositionInfo {
    poolAddress: PublicKey
    positionAddress: PublicKey
    positionNftAccount: PublicKey
    poolState: PoolState
    positionState: PositionState
    tokenA: PoolTokenInfo
    tokenB: PoolTokenInfo
    shareOfPoolPercentage: number
    poolValue: number // USD value
    positionValue: number
    positionUnclaimedFee: number // from tokenA + tokenB fee values
    poolBaseFeeBPS: number
    poolCurrentFeeBPS: number
}
export interface PoolPositionInfoMap {
    [key: string]: PoolPositionInfo
}

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
})

export const useDammUserPositions = () => useContext(DammUserPositionsContext)

export const DammUserPositionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet()
    const { connection } = useConnection()
    const { sendTxn } = useTransactionManager();
    const { refreshTokenAccounts } = useTokenAccounts();
    const [positions, setPositions] = useState<PoolPositionInfo[]>([])
    const [totalLiquidityValue, setTotalLiquidityValue] = useState<number>(0)

    const [loading, setLoading] = useState(false)

    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber())
    const [currentSlot, setCurrentSlot] = useState(0)

    const cpAmm = new CpAmm(connection);
    //const zap = new Zap(connection);

    const refreshPositions = async () => {
        if (!publicKey || !connection || loading) return
        setLoading(true)
        setPositions([]);
        setTotalLiquidityValue(0);
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        setCurrentSlot(await connection.getSlot())
        try {

            if (!publicKey || !connection) return
            setLoading(true)
            const positionsTemp: PoolPositionInfo[] = [];
            const allMints = new Set<string>();

            const userPositions = await cpAmm.getPositionsByUser(publicKey!)
            const poolAddreses = userPositions.map(x => x.positionState.pool);
            const allUserPoolStates = await cpAmm._program.account.pool.fetchMultiple(poolAddreses)
            const allPools = allUserPoolStates.map((x, i) => {
                if (x)
                    return {
                        publicKey: poolAddreses[i],
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
                        },
                        shareOfPoolPercentage: 0.5,
                        poolValue: 0,
                        positionValue: 0,
                        positionUnclaimedFee: 0,
                        poolBaseFeeBPS: 0,
                        poolCurrentFeeBPS: 0,
                    })

                    allMints.add(pool.tokenAMint.toString())
                    allMints.add(pool.tokenBMint.toString())
                }
                //await new Promise(res => setTimeout(res, 500));
            };

            // If no positions found, set empty state
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
                //const positionLiquidity = new BN(q64ToDecimal(position.positionState.unlockedLiquidity).toNumber());
                //const poolsqrtprice = q64ToDecimal(position.poolState.sqrtPrice);
                //const poolminsqrtprice = q64ToDecimal(position.poolState.sqrtMinPrice);

                //const price = getPriceFromSqrtPrice(position.poolState.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals);

                const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;

                position.tokenA.tokenProgram = tokenAMetadata?.tokenProgram;
                position.tokenA.name = tokenAMetadata?.name || 'Unknown Token';
                position.tokenA.symbol = tokenAMetadata?.symbol || 'UNK';
                position.tokenA.image = tokenAMetadata?.image;
                position.tokenA.decimals = tokenAMetadata?.decimals;
                position.tokenA.poolAmount = poolTokenAAmount;
                position.tokenA.positionAmount = positionTokenAAmount;
                position.tokenA.unclaimedFee = tokenAUnclaimedFees;

                position.tokenB.tokenProgram = tokenBMetadata?.tokenProgram;
                position.tokenB.name = tokenBMetadata?.name || 'Unknown Token';
                position.tokenB.symbol = tokenBMetadata?.symbol || 'UNK';
                position.tokenB.image = tokenBMetadata?.image;
                position.tokenB.decimals = tokenBMetadata?.decimals;

                position.tokenB.poolAmount = poolTokenBAmount;
                position.tokenB.positionAmount = positionTokenBAmount;
                position.tokenB.unclaimedFee = tokenBUnclaimedFees;

                position.poolValue = poolTokenAAmount * tokenAMetadata!.price +
                    poolTokenBAmount * tokenBMetadata!.price;
                position.positionValue = positionTokenAAmount * tokenAMetadata!.price +
                    positionTokenBAmount * tokenBMetadata!.price;
                position.shareOfPoolPercentage = shareOfPool;
                position.positionUnclaimedFee =
                    tokenAUnclaimedFees * tokenAMetadata!.price +
                    tokenBUnclaimedFees * tokenBMetadata!.price;

                position.poolBaseFeeBPS = feeNumeratorToBps(getBaseFeeNumerator(
                    position.poolState.poolFees.baseFee.feeSchedulerMode,
                    position.poolState.poolFees.baseFee.cliffFeeNumerator,
                    new BN(position.poolState.poolFees.baseFee.numberOfPeriod),
                    position.poolState.poolFees.baseFee.reductionFactor));

                position.poolCurrentFeeBPS = feeNumeratorToBps(getFeeNumerator(
                    position.poolState.activationType === 0 ? currentSlot :
                        position.poolState.activationType === 1 ? currentTime : 0,
                    position.poolState.activationPoint,
                    position.poolState.poolFees.baseFee.numberOfPeriod,
                    position.poolState.poolFees.baseFee.periodFrequency,
                    position.poolState.poolFees.baseFee.feeSchedulerMode,
                    position.poolState.poolFees.baseFee.cliffFeeNumerator,
                    position.poolState.poolFees.baseFee.reductionFactor,
                    position.poolState.poolFees.dynamicFee
                ));
                //positionsParsed.push(position);

                positionsParsed.push(position)
                //await new Promise(res => setTimeout(res, 500));

            };
            //setPositions(positions)
            sortPositionsByInternal(positionsParsed, SortType.PoolCurrentFee, true);

            // Calculate totals
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
            setPositions([])
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
        //const positionLiquidity = new BN(q64ToDecimal(position.positionState.unlockedLiquidity).toNumber());
        //const poolsqrtprice = q64ToDecimal(position.poolState.sqrtPrice);
        //const poolminsqrtprice = q64ToDecimal(position.poolState.sqrtMinPrice);

        //const price = getPriceFromSqrtPrice(position.poolState.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals);

        const shareOfPool = positionLP.muln(10000).div(poolLP).toNumber() / 100;


        position.tokenA.poolAmount = poolTokenAAmount;
        position.tokenA.positionAmount = positionTokenAAmount;
        position.tokenA.unclaimedFee = tokenAUnclaimedFees;

        position.tokenB.poolAmount = poolTokenBAmount;
        position.tokenB.positionAmount = positionTokenBAmount;
        position.tokenB.unclaimedFee = tokenBUnclaimedFees;

        position.poolValue = poolTokenAAmount * tokenAMetadata!.price +
            poolTokenBAmount * tokenBMetadata!.price;
        position.positionValue = positionTokenAAmount * tokenAMetadata!.price +
            positionTokenBAmount * tokenBMetadata!.price;
        position.shareOfPoolPercentage = shareOfPool;
        position.positionUnclaimedFee =
            tokenAUnclaimedFees * tokenAMetadata!.price +
            tokenBUnclaimedFees * tokenBMetadata!.price;

        position.poolBaseFeeBPS = feeNumeratorToBps(getBaseFeeNumerator(
            position.poolState.poolFees.baseFee.feeSchedulerMode,
            position.poolState.poolFees.baseFee.cliffFeeNumerator,
            new BN(position.poolState.poolFees.baseFee.numberOfPeriod),
            position.poolState.poolFees.baseFee.reductionFactor));

        position.poolCurrentFeeBPS = feeNumeratorToBps(getFeeNumerator(
            position.poolState.activationType === 0 ? currentSlot :
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

                amount: new Decimal(tokenAAccount.amount).mul(Decimal.pow(10, tokenAAccount.decimals)).toNumber(),
                slippageBps: 1000,
            });

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
        // const currentTime = await connection.getBlockTime(currentSlot);

        // const liquidityDelta =
        //     position.positionState.unlockedLiquidity; // remove liquidity with too small amount

        // const inputMint = position.poolState.tokenAMint;
        // const outputMint = position.poolState.tokenBMint;
        // const inputTokenProgram = getTokenProgram(position.poolState.tokenAFlag);
        // const outputTokenProgram = getTokenProgram(position.poolState.tokenBFlag);
        // const amountARemoved = getAmountAFromLiquidityDelta(
        //     liquidityDelta,
        //     position.poolState.sqrtPrice,
        //     position.poolState.sqrtMaxPrice,
        //     Rounding.Down
        // );

        // // const amountBRemoved = getAmountBFromLiquidityDelta(
        // //     liquidityDelta,
        // //     pool.poolState.sqrtPrice,
        // //     pool.poolState.sqrtMinPrice,
        // //     Rounding.Down
        // // );

        // const transaction = new Transaction();
        // const removeLiquidityTx = await cpAmm.removeLiquidity({
        //     owner: publicKey!,
        //     pool: position.poolAddress,
        //     position: position.positionAddress,
        //     positionNftAccount: position.positionNftAccount,
        //     liquidityDelta: position.positionState.unlockedLiquidity,
        //     tokenAAmountThreshold: new BN(0),
        //     tokenBAmountThreshold: new BN(0),
        //     tokenAMint: position.poolState.tokenAMint,
        //     tokenBMint: position.poolState.tokenBMint,
        //     tokenAVault: position.poolState.tokenAVault,
        //     tokenBVault: position.poolState.tokenBVault,
        //     tokenAProgram: getTokenProgram(position.poolState.tokenAFlag),
        //     tokenBProgram: getTokenProgram(position.poolState.tokenBFlag),
        //     vestings: [],
        //     currentPoint: new BN(currentTime ?? 0),
        // });

        // transaction.add(removeLiquidityTx);

        // const [dammV2Quote, jupiterQuote] = await Promise.allSettled([
        //     cpAmm.getQuote({
        //         inAmount: amountARemoved,
        //         inputTokenMint: inputMint,
        //         slippage: 0.5,
        //         poolState: position.poolState,
        //         currentTime: currentTime ?? 0,
        //         currentSlot,
        //         tokenADecimal: position.tokenA.decimals,
        //         tokenBDecimal: position.tokenB.decimals,
        //     }),
        //     getJupiterQuote(
        //         inputMint,
        //         outputMint,
        //         amountARemoved,
        //         50,
        //         20,
        //         true,
        //         true,
        //         true,
        //         "https://lite-api.jup.ag"
        //     ),

        // ]);

        // const quotes = {
        //     dammV2: dammV2Quote.status === "fulfilled" ? dammV2Quote.value : null,
        //     jupiter: jupiterQuote.status === "fulfilled" ? jupiterQuote.value : null,
        // };

        // if (quotes.dammV2) {
        //     console.log("DAMM v2 quote:", quotes.dammV2.swapOutAmount.toString());
        // } else {
        //     console.log(
        //         "DAMM v2 quote failed:",
        //         dammV2Quote.status === "rejected" ? dammV2Quote.reason : "Unknown error"
        //     );
        // }

        // if (quotes.jupiter) {
        //     console.log("Jupiter quote:", quotes.jupiter.outAmount.toString());
        // } else {
        //     console.log(
        //         "Jupiter quote failed:",
        //         jupiterQuote.status === "rejected"
        //             ? jupiterQuote.reason
        //             : "Unknown error"
        //     );
        // }

        // let bestQuoteValue: BN | null = null;
        // let bestProtocol: string | null = null;

        // if (quotes.dammV2?.swapOutAmount) {
        //     bestQuoteValue = quotes.dammV2.swapOutAmount;
        //     bestProtocol = "dammV2";
        // }

        // if (quotes.jupiter?.outAmount) {
        //     const jupiterAmount = new BN(quotes.jupiter.outAmount);
        //     if (!bestQuoteValue || jupiterAmount.gt(bestQuoteValue)) {
        //         bestQuoteValue = jupiterAmount;
        //         bestProtocol = "jupiter";
        //     }
        // }

        // if (!bestProtocol || !bestQuoteValue) {
        //     throw new Error("No valid quotes obtained from any protocol");
        // }

        // console.log(
        //     `Best protocol: ${bestProtocol} with quote:`,
        //     bestQuoteValue.toString()
        // );

        // let zapOutTx;

        // if (bestProtocol === "dammV2") {
        //     zapOutTx = await zap.zapOutThroughDammV2({
        //         user: publicKey!,
        //         poolAddress: position.poolAddress,
        //         inputMint,
        //         outputMint,
        //         inputTokenProgram: inputTokenProgram,
        //         outputTokenProgram: outputTokenProgram,
        //         amountIn: amountARemoved,
        //         minimumSwapAmountOut: new BN(0),
        //         maxSwapAmount: amountARemoved,
        //         percentageToZapOut: 100,
        //     });
        // } else if (bestProtocol === "jupiter" && quotes.jupiter) {
        //     const swapInstructionResponse = await getJupiterSwapInstruction(
        //         publicKey!,
        //         quotes.jupiter
        //     );

        //     zapOutTx = await zap.zapOutThroughJupiter({
        //         user: publicKey!,
        //         inputMint,
        //         outputMint,
        //         inputTokenProgram,
        //         outputTokenProgram,
        //         jupiterSwapResponse: swapInstructionResponse,
        //         maxSwapAmount: new BN(quotes.jupiter.inAmount),
        //         percentageToZapOut: 100,
        //     });
        // } else {
        //     throw new Error(`Invalid protocol selected: ${bestProtocol}`);
        // }

        // transaction.add(zapOutTx);

        // await sendTxn(transaction, undefined, {
        //     notify: true,
        //     onError: () => {
        //         txToast.error("Zap Out failed");
        //     },
        //     onSuccess: async (x) => {
        //         txToast.success("Zap out successful", x);
        //         removePosition(position.positionAddress);
        //     }
        // });

    }

    return (
        <DammUserPositionsContext.Provider value={{
            positions, totalLiquidityValue, loading,
            refreshPositions, sortPositionsBy, updatePosition, removePosition, removeLiquidityAndSwapToQuote
        }}>
            {children}
        </DammUserPositionsContext.Provider>
    )
}
