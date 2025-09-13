import React, { useState } from 'react'
import { useEffect } from 'react'
import { RefreshCcw } from 'lucide-react'
import { CollectFeeMode, deriveCustomizablePoolAddress, feeNumeratorToBps, FeeSchedulerMode, getBaseFeeNumerator, getBaseFeeParams, getDynamicFeeParams, getFeeNumerator, getPriceFromSqrtPrice, getSqrtPriceFromPrice, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from '@meteora-ag/cp-amm-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { fetchTokenMetadataJup, metadataToAccounts, type TokenAccount, type TokenMetadataMap } from '../tokenUtils'
import Decimal from 'decimal.js'
import { MintSelectorInput } from './Simple/MintSelectorInput'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
import { txToast } from './Simple/TxToast'
import Dammv2PoolList from './Simple/Dammv2PoolList'
import { formatDurationNumber, type PoolDetailedInfo, type PoolInfo } from '../constants'
import { toast } from 'sonner'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useCpAmm } from '../contexts/CpAmmContext'
import { useGetSlot } from '../contexts/GetSlotContext'


const Dammv2PoolCreation: React.FC = () => {
    const { connection } = useConnection()
    const { getSlot } = useGetSlot();
    const { publicKey, connected } = useWallet()
    const { cpAmm } = useCpAmm();
    const [searchMint, setSearchMint] = useState('')
    const { refreshTokenAccounts } = useTokenAccounts()

    const { sendTxn } = useTransactionManager();

    //const { positions, totalLiquidityValue, loading, refreshPositions } = useDammUserPositions()
    const [pools, setPools] = useState<PoolInfo[]>([])
    const [detailedPools, setDetailedPools] = useState<PoolDetailedInfo[]>([])
    const [fetchingPools, setFetchingPools] = useState(false)
    const [tokenMetadataMap, setTokenMetadataMap] = useState<TokenMetadataMap>({});
    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber())

    const [showCreateForm, setShowCreateForm] = useState(true)

    const [tokenAMint, setTokenAMint] = useState("")
    const [tokenBaseAmount, setTokenBaseAmount] = useState<Decimal>(new Decimal(0))

    const [tokenBMint, setTokenBMint] = useState("So11111111111111111111111111111111111111112")
    const [tokenQuoteAmount, setTokenQuoteAmount] = useState<Decimal>(new Decimal(0))

    const [newPoolAddress, setNewPoolAddress] = useState<PublicKey | null>(null)
    const [newPoolAddressExists, setNewPoolAddressExists] = useState(false)

    const [initialPrice, setInitialPrice] = useState(new Decimal(0))
    const [initialPriceInput, setInitialPriceInput] = useState("0")

    const [useMaxPrice, setUseMaxPrice] = useState(false)
    const [maxPrice, setMaxPrice] = useState(new Decimal(0))
    const [maxPriceInput, setMaxPriceInput] = useState("0")

    const [useMinPrice, setUseMinPrice] = useState(false)
    const [minPrice, setMinPrice] = useState(new Decimal(0))
    const [minPriceInput, setMinPriceInput] = useState("0")

    const [useDynamicFee, setUseDynamicFee] = useState(true)

    const [maxBaseFeePercentage, setMaxBaseFeePercentage] = useState(new Decimal(40))
    const [maxBaseFeePercentageInput, setMaxBaseFeePercentageInput] = useState("40")

    const [baseFeePercentage, setBaseFeePercentage] = useState(new Decimal(20))
    const [baseFeePercentageInput, setBaseFeePercentageInput] = useState("20")

    const [totalSchedulerDuration, setTotalSchedulerDuration] = useState<number>(4800)
    const [totalSchedulerDurationInput, setTotalSchedulerDurationInput] = useState("4800")

    const [schedulerReductionPeriod, setSchedulerReductionPeriod] = useState<number>(1)
    const [schedulerReductionPeriodInput, setSchedulerReductionPeriodInput] = useState("1")

    const [selectedFeeScheduler, setSelectedFeeScheduler] = useState<FeeSchedulerMode>(FeeSchedulerMode.Linear)
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
        uniqueByMint.sort((a, b) => b.amount.sub(a.amount).toNumber());
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

    useEffect(() => {
        setMaxPriceInput(maxPrice.toFixed())
    }, [maxPrice])

    useEffect(() => {
        setMinPriceInput(minPrice.toFixed())
    }, [minPrice])

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
        setShowCreateForm(false);
        setTokenMetadataMap({});
        setPools([])
        mapPools([], {});
        setFetchingPools(true)
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        let mints: string[] = [];
        if (searchMint === '') {
            const pools = await cpAmm.getAllPools();
            pools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber())
            const allPools = (pools).slice(0, 20);

            mints.push(...allPools.map(p => p.account.tokenAMint.toBase58()));
            mints.push(...allPools.map(p => p.account.tokenBMint.toBase58()));
            mints = [...new Set(mints)]
            const tm = await fetchTokenMetadataJup(mints);
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

        const allPoolsA = await cpAmm._program.account.pool.all([{
            memcmp: {
                encoding: 'base58',
                offset: 168,
                bytes: searchMint,
            }
        }])

        const allPoolsB = await cpAmm._program.account.pool.all([{
            memcmp: {
                encoding: 'base58',
                offset: 168 + 32,
                bytes: searchMint,
            }
        }])

        const allPools = [...allPoolsA, ...allPoolsB];

        const related = allPools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber()).slice(0, 20);
        mints.push(...related.map(p => p.account.tokenAMint.toBase58()));
        mints.push(...related.map(p => p.account.tokenBMint.toBase58()));
        mints = [...new Set(mints)];
        const tm = await fetchTokenMetadataJup(mints);
        setTokenMetadataMap(tm);
        setPools(related)
        mapPools(related, tm);
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
                ...tokenAMetadata,
                poolAmount: poolTokenAAmount,
                totalFees: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)).mul(tokenAMetadata?.price),
            }

            const poolTokenB = {
                ...tokenBMetadata,
                poolAmount: poolTokenBAmount,
                totalFees: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),
            }

            let activationTime = 0;
            if (x.account.activationType === 0) {
                activationTime = ((getSlot() - x.account.activationPoint.toNumber()) * 400 / 1000);
            } else {
                activationTime = currentTime - x.account.activationPoint.toNumber();
            }

            detailedPools.push({
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
                    x.account.activationType === 0 ? getSlot() :
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
                TVL: poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmount * tokenBMetadata.price.toNumber(),
                lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmountLocked * tokenBMetadata.price.toNumber(),
                totalFees: poolTokenA.totalFees.add(poolTokenB.totalFees),
            });
        };
        setDetailedPools(detailedPools);
    };

    const handleCreatePool = async (addConfig: boolean) => {
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

            const metadata = await fetchTokenMetadataJup([tokenAMint, tokenBMint])

            const tokenAMetadata = metadata[tokenAMint];
            const tokenBMetadata = metadata[tokenBMint];

            const decimalsA = tokenAMetadata?.decimals || 9
            const decimalsB = tokenBMetadata?.decimals || 9
            console.log(decimalsA, decimalsB);
            const tokenAAmount = new BN(tokenBaseAmount.toNumber() * (10 ** decimalsA));
            const tokenBAmount = new BN(tokenQuoteAmount.toNumber() * (10 ** decimalsB));

            console.log(minPrice.toString());
            console.log(minPrice.mul(Decimal.pow(10, decimalsA)).toNumber());
            console.log(new BN(maxPrice.mul(Decimal.pow(10, decimalsA)).toNumber()));

            const minSqrtPrice = (minPrice.greaterThan(0) && useMinPrice) ? getSqrtPriceFromPrice(minPrice.toString(), decimalsA, decimalsB) : MIN_SQRT_PRICE;
            const maxSqrtPrice = (maxPrice.greaterThan(0) && useMinPrice) ? getSqrtPriceFromPrice(maxPrice.toString(), decimalsA, decimalsB) : MAX_SQRT_PRICE;

            const { liquidityDelta: initPoolLiquidityDelta, initSqrtPrice } =
                cpAmm.preparePoolCreationParams({
                    tokenAAmount,
                    tokenBAmount,
                    minSqrtPrice: minSqrtPrice,
                    maxSqrtPrice: maxSqrtPrice,
                });

            const maxFee = maxBaseFeePercentage.toNumber();
            const minFee = baseFeePercentage.toNumber();
            const totalDuration = new BN(totalSchedulerDuration).muln(60);
            const reductionPeriod = schedulerReductionPeriod * 60;
            const poolFees = {
                baseFee: getBaseFeeParams(maxFee * 100, minFee * 100, selectedFeeScheduler, totalDuration.div(new BN(reductionPeriod)).toNumber(), totalDuration.toNumber()),
                padding: [],
                dynamicFee: useDynamicFee ? getDynamicFeeParams(0, 1500) : null,
            };

            const positionNft = Keypair.generate();

            const { tx, pool } = await cpAmm.createCustomPool({
                payer: publicKey!,
                creator: publicKey!,
                positionNft: positionNft.publicKey,
                tokenAMint: tokenA,
                tokenBMint: tokenB,
                tokenAAmount: tokenAAmount,
                tokenBAmount: tokenBAmount,
                initSqrtPrice: initSqrtPrice,
                sqrtMinPrice: minSqrtPrice,
                sqrtMaxPrice: maxSqrtPrice,
                liquidityDelta: initPoolLiquidityDelta,
                poolFees,
                hasAlphaVault: false,
                collectFeeMode: selectedFeeMode, // 0: BothToken, 1: onlyB
                activationPoint: null,
                activationType: 1, // 0: slot, 1: timestamp
                tokenAProgram: new PublicKey(tokenAMetadata?.tokenProgram || TOKEN_2022_PROGRAM_ID),
                tokenBProgram: new PublicKey(tokenBMetadata?.tokenProgram || TOKEN_PROGRAM_ID),
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
        <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-75px)] space-y-2 px-2 md:px-0">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-2 space-y-1">

                <div>
                    <div className="relative w-full">
                        <label className="block text-sm text-gray-400">Token mint address of a pool</label>
                        <div className="flex" >
                            <button
                                type="button"
                                onClick={() => fetchPools()}
                                className="flex items-center justify-center px-3 py-0.5  bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white"
                                title="Refresh pools"
                            >
                                <RefreshCcw className="w-4 h-4" />
                            </button>
                            <input
                                className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-white md:text-xs placeholder-gray-500"
                                placeholder="Enter mint address..."
                                value={searchMint}
                                onChange={(e) => setSearchMint(e.target.value.trim())}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-2 space-y-2">
                {connected && (
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="bg-purple-600 hover:bg-purple-500 px-2 py-0.5 rounded-md text-white text-sm font-medium"
                    >
                        {showCreateForm ? "Hide Create Pool Form" : "Show Create Pool Form"}
                    </button>
                )}
                {showCreateForm && connected && (
                    <div className="space-y-2">
                        <div className='grid grid-cols-2 gap-1'>
                            <div className="relative">
                                <label className="block text-sm text-gray-400">Base Token</label>
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
                                <label className="block text-sm text-gray-400">Quote Token</label>
                                <MintSelectorInput
                                    tokenAccounts={commonTokens}
                                    mint={tokenBMint}
                                    amount={tokenQuoteAmount}
                                    onMintChange={(e) => setTokenBMint(e)}
                                    onAmountChange={(e) => setTokenQuoteAmount(e)}

                                    onOpenDropdown={async () => await updateCommonTokens()}
                                />
                            </div>
                        </div>
                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400">Initial Price</label>
                            <div className="flex">
                                <button
                                    type="button"
                                    onClick={handleFetchPrice}
                                    className="flex min-w-20 items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white text-xs"
                                >
                                    Get Price
                                </button>
                                <input
                                    type="text"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
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
                        <div className='grid grid-cols-2 gap-1'>
                            <div className="relative w-full">
                                <div className='flex flex-cols gap-1'>
                                    <input type='checkbox'
                                        checked={useMaxPrice}
                                        onChange={(e) => setUseMaxPrice(e.target.checked)}>
                                    </input>
                                    <label className="block text-sm text-gray-400">Max Price</label>

                                </div>
                                <div className="flex">
                                    <input
                                        type="text"
                                        pattern="^[0-9]*[.,]?[0-9]*$"
                                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                                        placeholder="0"
                                        value={maxPriceInput}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            // Allow only valid decimal patterns
                                            if (/^\d*\.?\d*$/.test(val)) {
                                                setMaxPriceInput(val)
                                            }
                                        }}
                                        onBlur={() => {
                                            try {
                                                const d = new Decimal(maxPriceInput || "0")
                                                setMaxPrice(d)
                                            } catch {
                                                setMaxPrice(new Decimal(0))
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="relative w-full">
                                <div className='flex flex-cols gap-1'>
                                    <input type='checkbox'
                                        checked={useMinPrice}
                                        onChange={(e) => setUseMinPrice(e.target.checked)}>
                                    </input>
                                    <label className="block text-sm text-gray-400">Min Price</label>
                                </div>
                                <div className="flex">
                                    <input
                                        type="text"
                                        pattern="^[0-9]*[.,]?[0-9]*$"
                                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                                        placeholder="0"
                                        value={minPriceInput}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            // Allow only valid decimal patterns
                                            if (/^\d*\.?\d*$/.test(val)) {
                                                setMinPriceInput(val)
                                            }
                                        }}
                                        onBlur={() => {
                                            try {
                                                const d = new Decimal(minPriceInput || "0")
                                                setMinPrice(d)
                                            } catch {
                                                setMinPrice(new Decimal(0))
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="relative flex flex-cols w-full gap-1 bg-gray-800 border-t border-b border-r border-gray-700 rounded-md text-white text-xs">

                            <input type='checkbox'
                                checked={useDynamicFee}
                                onChange={(e) => setUseDynamicFee(e.target.checked)}>
                            </input>
                            <label className="w-full select-none text-reado">

                                Use Dynamic Fee
                            </label>
                        </div>
                        <div className='grid grid-cols-2 gap-1'>
                            <div className="relative w-full">
                                <label className="block text-sm text-gray-400">Starting Fee</label>
                                <div className="flex">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        pattern="^[0-9]*[.,]?[0-9]*$"
                                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
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
                                <label className="block text-sm text-gray-400">Base Fee (Fee Tier)</label>
                                <div className="flex">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        pattern="^[0-9]*[.,]?[0-9]*$"
                                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
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
                        </div>
                        <div className="relative w-full">
                            <label className="block text-sm text-gray-400">Scheduler Duration({formatDurationNumber(totalSchedulerDuration)})</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
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
                            <label className="block text-sm text-gray-400">Scheduler Reduction Period({formatDurationNumber(schedulerReductionPeriod)})</label>
                            <div className="flex">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
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
                        <div className='grid grid-cols-2 gap-1'>
                            <div className="relative w-full">
                                <label className="block text-sm text-gray-400">Fee Schedule Mode</label>

                                <button
                                    type="button"
                                    onClick={() => setFeeSchedulerDropdownOpen(!feeSchedulerDropdownOpen)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 text-xs text-white text-left flex justify-between items-center"
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
                                                    className={`px-2 cursor-pointer hover:bg-gray-700 text-white text-xs ${selectedFeeScheduler === Number(val) ? 'bg-gray-700' : ''
                                                        }`}
                                                >
                                                    {key}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div className="relative w-full">
                                <label className="block text-sm text-gray-400">Fee Collection Mode</label>

                                <button
                                    type="button"
                                    onClick={() => setFeeModeDropdownOpen(!feeModeDropdownOpen)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 text-white text-xs text-left flex justify-between items-center"
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
                                                    className={`px-2 cursor-pointer hover:bg-gray-700 text-white text-xs ${selectedFeeMode === Number(val) ? 'bg-gray-700' : ''
                                                        }`}
                                                >
                                                    {key}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        {!newPoolAddressExists && connected ?
                            <button
                                className="bg-green-600 hover:bg-green-500 px-2 rounded-lg text-white font-semibold"
                                onClick={(e) => handleCreatePool(e.shiftKey)}
                            >
                                Create Pool
                            </button>
                            :
                            <a
                                className="h-full bg-red-600 hover:bg-red-500 px-2 rounded-lg text-white font-semibold text-sm"
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