import React, { useState } from 'react'
import { useEffect } from 'react'
import { RefreshCcw } from 'lucide-react'
import { CollectFeeMode, CpAmm, deriveCustomizablePoolAddress, derivePoolAddress, feeNumeratorToBps, FeeSchedulerMode, getBaseFeeNumerator, getBaseFeeParams, getDynamicFeeParams, getFeeNumerator, getPriceFromSqrtPrice, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from '@meteora-ag/cp-amm-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { fetchTokenMetadata, metadataToAccounts, type TokenAccount, type TokenMetadataMap } from '../tokenUtils'
import Decimal from 'decimal.js'
import { MintSelectorInput } from './Simple/MintSelectorInput'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
import { txToast } from './Simple/TxToast'
import Dammv2PoolList from './Simple/Dammv2PoolList'
import type { PoolDetailedInfo, PoolInfo } from '../constants'
import { toast } from 'sonner'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'


const Dammv2PoolCreation: React.FC = () => {
    const { publicKey, connected } = useWallet()
    const { connection } = useConnection()
    const [searchMint, setSearchMint] = useState('')
    const { refreshTokenAccounts } = useTokenAccounts()

    const { sendTxn } = useTransactionManager();

    //const { positions, totalLiquidityValue, loading, refreshPositions } = useDammUserPositions()
    const [pools, setPools] = useState<PoolInfo[]>([])
    const [detailedPools, setDetailedPools] = useState<PoolDetailedInfo[]>([])
    const [fetchingPools, setFetchingPools] = useState(false)
    const [tokenMetadataMap, setTokenMetadataMap] = useState<TokenMetadataMap>({});
    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber())
    const [currentSlot, setCurrentSlot] = useState(0)

    const [showCreateForm, setShowCreateForm] = useState(true)

    const [tokenAMint, setTokenAMint] = useState("")
    const [tokenBaseAmount, setTokenBaseAmount] = useState<Decimal>(new Decimal(0))

    const [tokenBMint, setTokenBMint] = useState("So11111111111111111111111111111111111111112")
    const [tokenQuoteAmount, setTokenQuoteAmount] = useState<Decimal>(new Decimal(0))


    const [newPoolAddress, setNewPoolAddress] = useState<PublicKey | null>(null)
    const [newPoolAddressExists, setNewPoolAddressExists] = useState(false)

    const [initialPrice, setInitialPrice] = useState(new Decimal(0))
    const [initialPriceInput, setInitialPriceInput] = useState("0")

    const [maxBaseFeePercentage, setMaxBaseFeePercentage] = useState(new Decimal(40))
    const [maxBaseFeePercentageInput, setMaxBaseFeePercentageInput] = useState("40")

    const [baseFeePercentage, setBaseFeePercentage] = useState(new Decimal(20))
    const [baseFeePercentageInput, setBaseFeePercentageInput] = useState("20")

    const [totalSchedulerDuration, setTotalSchedulerDuration] = useState<number>(4800)
    const [totalSchedulerDurationInput, setTotalSchedulerDurationInput] = useState("4800")

    const [schedulerReductionPeriod, setSchedulerReductionPeriod] = useState<number>(1)
    const [schedulerReductionPeriodInput, setSchedulerReductionPeriodInput] = useState("1")

    const [selectedFeeScheduler, setSelectedFeeScheduler] = useState<FeeSchedulerMode>(FeeSchedulerMode.Exponential)
    const [feeSchedulerDropdownOpen, setFeeSchedulerDropdownOpen] = useState(false)

    const [selectedFeeMode, setSelectedFeeMode] = useState<CollectFeeMode>(CollectFeeMode.OnlyB)
    const [feeModeDropdownOpen, setFeeModeDropdownOpen] = useState(false)


    const [commonTokens, setCommonTokens] = useState<TokenAccount[]>([]);

    const updateCommonTokens = async (): Promise<void> => {
        const poolTokens = Object.values(tokenMetadataMap);
        const { tokenAccounts } = await refreshTokenAccounts();
        const merged = [...tokenAccounts, ...metadataToAccounts(poolTokens)];
        const uniqueByMint = Array.from(
            new Map(merged.map(token => [token.mint, token])).values()
        );
        uniqueByMint.sort((a, b) => b.amount - a.amount);
        setCommonTokens(uniqueByMint);
    }

    useEffect(() => {
        if (initialPrice) {
            setTokenQuoteAmount(tokenBaseAmount.mul(initialPrice));
        }
    }, [tokenBaseAmount])

    useEffect(() => {
        setInitialPriceInput(initialPrice.toFixed())
    }, [initialPrice])

    const cpAmm = new CpAmm(connection);

    const handleFetchPrice = async () => {
        if (!tokenAMint || !tokenBMint) {
            return
        }

        try {
            const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${tokenAMint},${tokenBMint}`)
            const data = await res.json();

            const tokenAPrice = data?.[tokenAMint]?.usdPrice;
            const tokenBPrice = data?.[tokenBMint]?.usdPrice;
            if (tokenAPrice && tokenBPrice) {
                setInitialPrice(Decimal.div(tokenAPrice, tokenBPrice))
            } else {
                toast.error('No price returned')
                setInitialPrice(new Decimal(0));
            }
        } catch {
            toast.error('Error while fetching prices.')
            setInitialPrice(new Decimal(0));
        }
    }

    const fetchPools = async () => {
        if (!connection) return
        setTokenMetadataMap({});
        setPools([])
        mapPools([], {});
        setFetchingPools(true)
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        setCurrentSlot(await connection.getSlot())
        let mints: string[] = [];
        try {
            if (searchMint === '') {
                const pools = await cpAmm.getAllPools();
                pools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber())
                const allPools = (pools).slice(0, 20);

                mints.push(...allPools.map(p => p.account.tokenAMint.toBase58()));
                mints.push(...allPools.map(p => p.account.tokenBMint.toBase58()));
                mints = [...new Set(mints)]
                const tm = await fetchTokenMetadata(connection, mints);
                setTokenMetadataMap(tm);
                setPools(allPools);
                mapPools(allPools, tm);
                setFetchingPools(false);
                return;
            }
            const mintKey = new PublicKey(searchMint);
            if (!mintKey) {
                setTokenMetadataMap({});
                setPools([])
                mapPools([], {});
                setFetchingPools(false)
                console.error('Invalid mint address')
                return;
            }

            const allPoolsA = await cpAmm._program.account.pool.all([{memcmp:{
                encoding:'base58',
                offset: 168,
                bytes:searchMint,
            }}])

            const allPoolsB = await cpAmm._program.account.pool.all([{memcmp:{
                encoding:'base58',
                offset: 168 + 32,
                bytes:searchMint,
            }}])

            const allPools = [...allPoolsA, ...allPoolsB];
            
            const related = allPools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber()).slice(0, 20);
            mints.push(...related.map(p => p.account.tokenAMint.toBase58()));
            mints.push(...related.map(p => p.account.tokenBMint.toBase58()));
            mints = [...new Set(mints)];
            const tm = await fetchTokenMetadata(connection, mints);
            setTokenMetadataMap(tm);
            setPools(related)
            mapPools(related, tm);

        } catch (err) {
            console.error('Failed to fetch pools:', err)
            setTokenMetadataMap({});
            setPools([])
            mapPools([], {});
        }
        setFetchingPools(false)
    }

    const mapPools = async (p: PoolInfo[], tm: TokenMetadataMap) => {
        const detailedPools: PoolDetailedInfo[] = []
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

            const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolTokenAAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const poolTokenBAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals));

            const poolTokenA = {
                mint: tokenAMetadata.mint,
                tokenProgram: tokenAMetadata.tokenProgram,
                symbol: tokenAMetadata.symbol || 'UNK',
                name: tokenAMetadata.name || 'Unknown',
                poolAmount: poolTokenAAmount,
                decimals: tokenAMetadata.decimals,
                price: tokenAMetadata.price,
                image: tokenAMetadata.image || undefined,
                totalFees: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)).mul(tokenAMetadata?.price)
            }

            const poolTokenB = {
                mint: tokenBMetadata.mint,
                tokenProgram: tokenBMetadata.tokenProgram,
                symbol: tokenBMetadata.symbol || 'UNK',
                name: tokenBMetadata.name || 'Unknown',
                poolAmount: poolTokenBAmount,
                decimals: tokenBMetadata.decimals,
                price: tokenBMetadata.price,
                image: tokenBMetadata.image || undefined,
                totalFees: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price)
            }

            const activationTime = currentTime - (new BN(x.account.activationType === 0
                ? await connection.getBlockTime(x.account.activationPoint.toNumber()) || 0 :
                x.account.activationType === 1
                    ? x.account.activationPoint.toNumber()
                    : 0)).toNumber();

            detailedPools.push({
                poolInfo: x,
                tokenA: poolTokenA,
                tokenB: poolTokenB,
                activationTime: activationTime,
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
                TVL: poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price + poolTokenBAmount * tokenBMetadata.price,
                lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price + poolTokenBAmountLocked * tokenBMetadata.price,
                totalFees: poolTokenA.totalFees.add(poolTokenB.totalFees),
            });
        };
        setDetailedPools(detailedPools);
    };

    const handleCreatePool = async (addConfig:boolean) => {
        console.log("shiftkey", addConfig);
        if (!tokenAMint || !tokenBMint) {
            return
        }

        if (newPoolAddressExists) {
            return;
        }

        try {
            const tokenA = new PublicKey(tokenAMint)
            const tokenB = new PublicKey(tokenBMint)

            const metadata = await fetchTokenMetadata(connection, [tokenAMint, tokenBMint])

            const tokenAMetadata = metadata[tokenAMint];
            const tokenBMetadata = metadata[tokenBMint];

            const tokenAAmount = new BN(tokenBaseAmount.toNumber() * (10 ** tokenAMetadata.decimals));
            const tokenBAmount = new BN(tokenQuoteAmount.toNumber() * (10 ** tokenBMetadata.decimals));

            const { liquidityDelta: initPoolLiquidityDelta, initSqrtPrice } =
                cpAmm.preparePoolCreationParams({
                    tokenAAmount,
                    tokenBAmount,
                    minSqrtPrice: MIN_SQRT_PRICE,
                    maxSqrtPrice: MAX_SQRT_PRICE,
                });

            const maxFee = maxBaseFeePercentage.toNumber();
            const minFee = baseFeePercentage.toNumber();
            const totalDuration = new BN(totalSchedulerDuration).muln(60);
            const reductionPeriod = schedulerReductionPeriod * 60;
            const poolFees = {
                baseFee: getBaseFeeParams(maxFee * 100, minFee * 100, selectedFeeScheduler, totalDuration.div(new BN(reductionPeriod)).toNumber(), totalDuration.toNumber()),
                padding: [],
                dynamicFee: getDynamicFeeParams(25, 150),
            };

            let config: PublicKey | undefined;

            try {
                if (addConfig) {
                    config = new PublicKey(await navigator.clipboard.readText());
            console.log("shiftkey", addConfig, "config:", config);

                }
            } catch { }

            console.log("shiftkey", addConfig, "config:", config, await navigator.clipboard.readText());

            const positionNft = Keypair.generate();
            if (!config) {
                const { tx, pool } = await cpAmm.createCustomPool({
                    payer: publicKey!,
                    creator: publicKey!,
                    positionNft: positionNft.publicKey,
                    tokenAMint: tokenA,
                    tokenBMint: tokenB,
                    tokenAAmount: tokenAAmount,
                    tokenBAmount: tokenBAmount,
                    initSqrtPrice: initSqrtPrice,
                    sqrtMinPrice: MIN_SQRT_PRICE,
                    sqrtMaxPrice: MAX_SQRT_PRICE,
                    liquidityDelta: initPoolLiquidityDelta,
                    poolFees,
                    hasAlphaVault: false,
                    collectFeeMode: selectedFeeMode, // 0: BothToken, 1: onlyB
                    activationPoint: null,
                    activationType: 1, // 0: slot, 1: timestamp
                    tokenAProgram: new PublicKey(tokenAMetadata.tokenProgram),
                    tokenBProgram: new PublicKey(tokenBMetadata.tokenProgram),
                });
                try {
                    await sendTxn(tx, [positionNft],
                        {
                            notify: true,
                            onSuccess: async () => {
                                txToast.showPool(pool.toBase58());
                                await updateCommonTokens();
                                setTokenBaseAmount(new Decimal(0));
                                setNewPoolAddressExists(true);
                            },
                        }
                    );

                } catch (e) {
                    console.log(e);
                }
            } else {
                const tx = await cpAmm.createPool({
                    payer: publicKey!,
                    config: config,
                    creator: publicKey!,
                    positionNft: positionNft.publicKey,
                    tokenAMint: tokenA,
                    tokenBMint: tokenB,
                    tokenAAmount: tokenAAmount,
                    tokenBAmount: tokenBAmount,
                    initSqrtPrice: initSqrtPrice,
                    isLockLiquidity: false,

                    
                    liquidityDelta: initPoolLiquidityDelta,
                    activationPoint: null,
                    tokenAProgram: new PublicKey(tokenAMetadata.tokenProgram),
                    tokenBProgram: new PublicKey(tokenBMetadata.tokenProgram),
                });

                try {
                    await sendTxn(tx, [positionNft],
                        {
                            notify: true,
                            onSuccess: async () => {
                                txToast.showPool(derivePoolAddress(config, tokenA, tokenB).toBase58());
                                await updateCommonTokens();
                                setTokenBaseAmount(new Decimal(0));
                                setNewPoolAddressExists(true);
                            },
                        }
                    );

                } catch (e) {
                    console.log(e);
                }
            }
        } catch (err) {
            console.error("Failed to create pool:", err)
        }
    }

    useEffect(() => {
        if (tokenAMint && tokenBMint) {
            handleFetchPrice();
            try {
                const pubKey = deriveCustomizablePoolAddress(new PublicKey(tokenAMint), new PublicKey(tokenBMint))
                if (pubKey) {
                    const promise = cpAmm.isPoolExist(pubKey);
                    promise.catch(() => {
                        setNewPoolAddress(null);
                        setNewPoolAddressExists(false);
                    });

                    promise.then((x) => {
                        setNewPoolAddress(pubKey);
                        setNewPoolAddressExists(x);

                    });

                } else {
                    setNewPoolAddress(null);
                    setNewPoolAddressExists(false);
                }
            } catch {
                setNewPoolAddress(null);
                setNewPoolAddressExists(false);
            }
        }


    }, [tokenAMint, tokenBMint])

    useEffect(() => {
        if (tokenAMint && tokenBMint)
            setTokenQuoteAmount(tokenBaseAmount.mul(initialPrice))
    }, [initialPrice, tokenBaseAmount])

    useEffect(() => {
        updateCommonTokens();
    }, []);

    return (
        <div className="space-y-2">
            {/* Snipe Form */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-2">

                <div>
                    <div className="relative w-full">
                        <label className="block text-sm text-gray-400 mb-1">Token mint address of a pool</label>
                        <div className="flex" >
                            <button
                                type="button"
                                onClick={() => fetchPools()}
                                className="flex items-center justify-center px-3 py-2  bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white"
                                title="Refresh pools"
                            >
                                <RefreshCcw className="w-5 h-5" />
                            </button>
                            <input
                                className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                placeholder="Enter mint address..."
                                value={searchMint}
                                onChange={(e) => setSearchMint(e.target.value.trim())}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-2">
                {connected && (
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-white font-medium"
                    >
                        {showCreateForm ? "Hide Create Pool Form" : "Create New DAMMv2 Pool"}
                    </button>
                )}
                {showCreateForm && connected && (
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="block text-sm text-gray-400 mb-1">Base Token</label>
                            <MintSelectorInput
                                tokenAccounts={commonTokens}
                                mint={tokenAMint}
                                amount={tokenBaseAmount}
                                onMintChange={(e) => setTokenAMint(e)}
                                onAmountChange={(e) => setTokenBaseAmount(e)}
                                onOpenDropdown={async () => await updateCommonTokens()}
                            />

                        </div>

                        <div className="relative">
                            <label className="block text-sm text-gray-400 mb-1">Quote Token</label>
                            <MintSelectorInput
                                tokenAccounts={commonTokens}
                                mint={tokenBMint}
                                amount={tokenQuoteAmount}
                                onMintChange={(e) => setTokenBMint(e)}
                                onAmountChange={(e) => setTokenQuoteAmount(e)}

                                onOpenDropdown={async () => await updateCommonTokens()}
                            />
                        </div>
                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Initial Price</label>
                            <div className="flex">
                                <button
                                    type="button"
                                    onClick={handleFetchPrice}
                                    className="flex min-w-40 items-center justify-center px-3 py-2 bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white"
                                >
                                    Get Price
                                </button>
                                <input
                                    type="text"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                    placeholder="0"
                                    value={initialPriceInput}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        // Allow only valid decimal patterns
                                        if (/^\d*\.?\d*$/.test(val)) {
                                            setInitialPriceInput(val)
                                        }
                                    }}
                                    onBlur={() => {
                                        try {
                                            const d = new Decimal(initialPriceInput || "0")
                                            setInitialPrice(d)
                                        } catch {
                                            setInitialPrice(new Decimal(0))
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Max Fee Percentage(50% is maximum)</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                    placeholder="50"
                                    value={maxBaseFeePercentageInput}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        // Allow only valid decimal patterns
                                        if (/^\d*\.?\d*$/.test(val)) {
                                            setMaxBaseFeePercentageInput(val)
                                        }
                                    }}
                                    onBlur={() => {
                                        // When leaving input, convert to Decimal
                                        try {
                                            const d = new Decimal(maxBaseFeePercentageInput || "0")
                                            setMaxBaseFeePercentage(d)
                                        } catch {
                                            setMaxBaseFeePercentage(new Decimal(6))
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Base Fee Percentage</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                    placeholder="6"
                                    value={baseFeePercentageInput}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        // Allow only valid decimal patterns
                                        if (/^\d*\.?\d*$/.test(val)) {
                                            setBaseFeePercentageInput(val)
                                        }
                                    }}
                                    onBlur={() => {
                                        // When leaving input, convert to Decimal
                                        try {
                                            const d = new Decimal(baseFeePercentageInput || "0")
                                            setBaseFeePercentage(d)
                                        } catch {
                                            setBaseFeePercentage(new Decimal(6))
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Scheduler Total Duration</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                    placeholder="60"
                                    value={totalSchedulerDurationInput}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        // Allow only valid decimal patterns
                                        if (/^\d*\.?\d*$/.test(val)) {
                                            setTotalSchedulerDurationInput(val)
                                        }
                                    }}
                                    onBlur={() => {
                                        // When leaving input, convert to Decimal
                                        try {
                                            const d = new Decimal(totalSchedulerDurationInput || "0")
                                            setTotalSchedulerDuration(d.toNumber())
                                        } catch {
                                            setTotalSchedulerDuration(60)
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Scheduler Reduction Period (how many x minutes reduction happens)</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-500"
                                    placeholder="2"
                                    value={schedulerReductionPeriodInput}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        // Allow only valid decimal patterns
                                        if (/^\d*\.?\d*$/.test(val)) {
                                            setSchedulerReductionPeriodInput(val)
                                        }
                                    }}
                                    onBlur={() => {
                                        try {
                                            const d = new Decimal(schedulerReductionPeriodInput || "0")
                                            setSchedulerReductionPeriod(d.toNumber())
                                        } catch {
                                            setSchedulerReductionPeriod(2)
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Fee Schedule Mode</label>

                            <button
                                type="button"
                                onClick={() => setFeeSchedulerDropdownOpen(!feeSchedulerDropdownOpen)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-md px-4 py-2 text-white text-left flex justify-between items-center"
                            >
                                {FeeSchedulerMode[selectedFeeScheduler]} {/* Converts numeric value to string name */}
                                <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {feeSchedulerDropdownOpen && (
                                <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg">
                                    {Object.entries(FeeSchedulerMode)
                                        .filter(([, val]) => !isNaN(Number(val))) // Only numeric entries (skip reverse keys)
                                        .map(([key, val]) => (
                                            <div
                                                key={val}
                                                onClick={() => {
                                                    setSelectedFeeScheduler(Number(val))
                                                    setFeeSchedulerDropdownOpen(false)
                                                }}
                                                className={`px-4 py-2 cursor-pointer hover:bg-gray-700 text-white ${selectedFeeScheduler === Number(val) ? 'bg-gray-700' : ''
                                                    }`}
                                            >
                                                {key}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400 mb-1">Fee Collection Mode</label>

                            <button
                                type="button"
                                onClick={() => setFeeModeDropdownOpen(!feeModeDropdownOpen)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-md px-4 py-2 text-white text-left flex justify-between items-center"
                            >
                                {CollectFeeMode[selectedFeeMode]} {/* Converts numeric value to string name */}
                                <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {feeModeDropdownOpen && (
                                <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg">
                                    {Object.entries(CollectFeeMode)
                                        .filter(([, val]) => !isNaN(Number(val))) // Only numeric entries (skip reverse keys)
                                        .map(([key, val]) => (
                                            <div
                                                key={val}
                                                onClick={() => {
                                                    setSelectedFeeMode(Number(val))
                                                    setFeeModeDropdownOpen(false)
                                                }}
                                                className={`px-4 py-2 cursor-pointer hover:bg-gray-700 text-white ${selectedFeeMode === Number(val) ? 'bg-gray-700' : ''
                                                    }`}
                                            >
                                                {key}
                                            </div>
                                        ))}
                                </div>
                            )}


                        </div>
                        {!newPoolAddressExists && connected ?
                            <button
                                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-white font-semibold"
                                onClick={(e) =>handleCreatePool(e.shiftKey)}
                            >
                                Create Pool
                            </button>
                            :
                            <a
                                className="h-full bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-white font-semibold text-sm"
                                href={`https://edge.meteora.ag/dammv2/${newPoolAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Pool Exists
                            </a>}
                    </div>
                )}
            </div>
            {/* Pool Info Section */}
            {fetchingPools && (
                <div className="text-sm text-gray-400">Searching for pools...</div>
            )}

            {!fetchingPools && pools.length === 0 && (
                <div className="text-sm text-gray-500">No DAMMv2 pools found.</div>
            )}
            <Dammv2PoolList
                cpAmm={cpAmm}
                pools={detailedPools}
                tokenMetadataMap={tokenMetadataMap} />
        </div>
    )
}

export default Dammv2PoolCreation