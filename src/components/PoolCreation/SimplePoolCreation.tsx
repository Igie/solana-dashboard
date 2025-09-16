import { useEffect, useState } from "react"
import Decimal from "decimal.js"
import { Keypair, PublicKey } from "@solana/web3.js"
import { CollectFeeMode, derivePoolAddress, feeNumeratorToBps, FeeSchedulerMode, getBaseFeeNumerator, getBaseFeeParams, getPriceFromSqrtPrice, getSqrtPriceFromPrice, MAX_SQRT_PRICE, MIN_SQRT_PRICE, type ConfigState } from "@meteora-ag/cp-amm-sdk"
import { DecimalInput } from "../Simple/DecimalInput"
import { type TokenMetadataMap } from "../../tokenUtils"
import { BN } from "@coral-xyz/anchor"
import { useCpAmm } from "../../contexts/CpAmmContext"
import { useWallet } from "@jup-ag/wallet-adapter"
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { txToast } from "../Simple/TxToast"
import { useTransactionManager } from "../../contexts/TransactionManagerContext"
import { toast } from "sonner"
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system"

interface PoolConfig {
    publicKey: PublicKey;
    account: ConfigState;
}

interface SimplePoolCreationProps {

    tokenMetadata: TokenMetadataMap

    tokenAMint: string,
    tokenAAmount: Decimal
    setTokenAAmount: (v: Decimal) => void,

    tokenBMint: string,
    tokenBAmount: Decimal
    setTokenBAmount: (v: Decimal) => void,

    updateCommonTokens: () => Promise<void>
}

interface Preset {
    name: String
    useDynamicFee: boolean,
    baseFee: number,
    useScheduler: boolean,
    feeSchedulerMode: FeeSchedulerMode,
    collectFeeMode: CollectFeeMode,
}

const FeeTiers = [
    0.25, 0.30, 1, 2, 4, 6
]

const Presets: Preset[] = [
    {
        name: "Linear Scheduler 6%",
        useDynamicFee: true,
        baseFee: 6,
        useScheduler: true,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    },
    {
        name: "Linear Scheduler 4%",
        useDynamicFee: true,
        baseFee: 4,
        useScheduler: true,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    },
    {
        name: "Linear Scheduler 2%",
        useDynamicFee: true,
        baseFee: 2,
        useScheduler: true,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    }
]

const SimplePoolCreation: React.FC<SimplePoolCreationProps> = (
    {
        tokenMetadata,

        tokenAMint,
        tokenAAmount,
        setTokenAAmount,

        tokenBMint,
        tokenBAmount,
        setTokenBAmount,

        updateCommonTokens,
    }
) => {
    const { cpAmm } = useCpAmm();
    const { connected, publicKey } = useWallet();
    const { sendTxn } = useTransactionManager();

    const [poolConfigs, setPoolConfigs] = useState<DetailedPoolConfig[]>([])
    const [selectedPoolConfig, setSelectedPoolConfig] = useState<DetailedPoolConfig | undefined>(undefined)
    const [newPoolAddress, setNewPoolAddress] = useState<PublicKey | null>(null)
    const [newPoolAddressExists, setNewPoolAddressExists] = useState(false)
    const [initialPrice, setInitialPrice] = useState(new Decimal(0))

    const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false)

    const [useDynamicFee, setUseDynamicFee] = useState(true)
    const [baseFeePercentage, setBaseFeePercentage] = useState(new Decimal(6))
    const [baseFeeDropdownOpen, setBaseFeeDropdownOpen] = useState(false)
    const [useFeeScheduler, setUseFeeScheduler] = useState(true);
    const [selectedFeeScheduler, setSelectedFeeScheduler] = useState<FeeSchedulerMode>(FeeSchedulerMode.Linear)
    const [feeSchedulerDropdownOpen, setFeeSchedulerDropdownOpen] = useState(false)

    const [selectedFeeMode, setSelectedFeeMode] = useState<CollectFeeMode>(CollectFeeMode.OnlyB)
    const [feeModeDropdownOpen, setFeeModeDropdownOpen] = useState(false)

    const fetchPoolConfigs = async () => {
        let configs = await cpAmm.getAllConfigs();

        configs = configs.filter(x => {
            return x.account.sqrtMaxPrice.eq(MAX_SQRT_PRICE) && x.account.sqrtMinPrice.eq(MIN_SQRT_PRICE) &&
                x.account.poolCreatorAuthority.equals(SYSTEM_PROGRAM_ID)

        })
        const detailed = configs.map(x => getDetailedPoolConfig(x))
        setPoolConfigs(detailed);
    }

    interface DetailedPoolConfig {
        poolConfig: PoolConfig,
        configType: number,
        schedulerMode: FeeSchedulerMode,
        schedulerPeriod: number
        maxFee: number,
        baseFee: number,
        maxPrice: Decimal,
        minPrice: Decimal,
        dynamicFee: boolean,
        feeCollectionToken: CollectFeeMode
    }

    const getDetailedPoolConfig = (poolConfig: PoolConfig): DetailedPoolConfig => {
        const poolFees = poolConfig.account.poolFees;
        const detailedPolConfig: DetailedPoolConfig = {
            poolConfig: poolConfig,
            configType: poolConfig.account.configType,
            schedulerMode: poolFees.baseFee.feeSchedulerMode,
            schedulerPeriod: poolFees.baseFee.periodFrequency.muln(poolFees.baseFee.numberOfPeriod).toNumber(),
            baseFee: feeNumeratorToBps(getBaseFeeNumerator(
                poolFees.baseFee.feeSchedulerMode,
                poolFees.baseFee.cliffFeeNumerator,
                new BN(poolFees.baseFee.numberOfPeriod),
                poolFees.baseFee.reductionFactor)) / 100,
            maxFee: feeNumeratorToBps(poolFees.baseFee.cliffFeeNumerator) / 100,
            maxPrice: (poolConfig.account.sqrtMaxPrice.eq(MAX_SQRT_PRICE)) ?
                new Decimal(0) :
                getPriceFromSqrtPrice(poolConfig.account.sqrtMaxPrice, 9, 9),

            minPrice: (poolConfig.account.sqrtMinPrice.eq(MIN_SQRT_PRICE)) ?
                new Decimal(0) :
                getPriceFromSqrtPrice(poolConfig.account.sqrtMinPrice, 9, 9),
            dynamicFee: poolConfig.account.poolFees.dynamicFee.initialized == 1,
            feeCollectionToken: poolConfig.account.collectFeeMode

        }
        return detailedPolConfig
    }

    const handleCreatePool = async () => {
        if (!tokenAMint || !tokenBMint) {
            return
        }

        if (newPoolAddressExists) {
            return;
        }

        try {
            const tokenA = new PublicKey(tokenAMint)
            const tokenB = new PublicKey(tokenBMint)

            const tokenAMetadata = tokenMetadata[tokenAMint];
            const tokenBMetadata = tokenMetadata[tokenBMint];

            const decimalsA = tokenAMetadata.decimals;
            const decimalsB = tokenBMetadata.decimals;

            const tokenAAmountDeposit = new BN(tokenAAmount.toNumber() * (10 ** decimalsA));
            const tokenBAmountDeposit = new BN(tokenBAmount.toNumber() * (10 ** decimalsB));

            const { liquidityDelta: initPoolLiquidityDelta, initSqrtPrice } =
                cpAmm.preparePoolCreationParams({
                    tokenAAmount: tokenAAmountDeposit,
                    tokenBAmount: tokenBAmountDeposit,
                    minSqrtPrice: MIN_SQRT_PRICE,
                    maxSqrtPrice: MAX_SQRT_PRICE,
                });

            const positionNft = Keypair.generate();

            const pool = derivePoolAddress(selectedPoolConfig!.poolConfig.publicKey, tokenA, tokenB);

            const tx = await cpAmm.createPool({
                payer: publicKey!,
                creator: publicKey!,

                config: selectedPoolConfig!.poolConfig.publicKey,
                positionNft: positionNft.publicKey,
                tokenAMint: tokenA,
                tokenBMint: tokenB,
                tokenAAmount: tokenAAmountDeposit,
                tokenBAmount: tokenBAmountDeposit,
                initSqrtPrice: initSqrtPrice,
                liquidityDelta: initPoolLiquidityDelta,
                activationPoint: null,
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
                            setTokenAAmount(new Decimal(0));
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

    useEffect(() => {
        if (initialPrice) {
            setTokenBAmount(tokenAAmount.mul(initialPrice));
        }
    }, [tokenAAmount])

    useEffect(() => {
        if (tokenAMint && tokenBMint) {
            handleFetchPrice();
            try {
                const pubKey = derivePoolAddress(selectedPoolConfig!.poolConfig.publicKey, new PublicKey(tokenAMint), new PublicKey(tokenBMint))
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
    }, [tokenAMint, tokenBMint, selectedPoolConfig]);

    useEffect(() => {
        if (!baseFeePercentage || tokenAMint || tokenBMint) return;
        const baseFeeParams = getBaseFeeParams(
            useFeeScheduler ? 5000 : baseFeePercentage.mul(100).toNumber(),
            baseFeePercentage.mul(100).toNumber(),
            selectedFeeScheduler,
            useFeeScheduler ?
                (selectedFeeScheduler === FeeSchedulerMode.Exponential ?
                    120 : 144) : 0,
            useFeeScheduler ?
                (selectedFeeScheduler === FeeSchedulerMode.Exponential ?
                    7200 : 86400) : 0,
        )

        const b = feeNumeratorToBps(getBaseFeeNumerator(
            baseFeeParams.feeSchedulerMode,
            baseFeeParams.cliffFeeNumerator,
            new BN(baseFeeParams.numberOfPeriod),
            baseFeeParams.reductionFactor)) / 100;

        let pools = poolConfigs.filter(x =>
            useFeeScheduler === (x.schedulerPeriod > 0) &&
            x.schedulerMode === (useFeeScheduler ? selectedFeeScheduler : FeeSchedulerMode.Linear) &&
            x.dynamicFee === useDynamicFee &&
            (useDynamicFee ? x.poolConfig.account.poolFees.dynamicFee.maxVolatilityAccumulator === 14460000 : true) &&
            x.poolConfig.account.poolFees.baseFee.numberOfPeriod === baseFeeParams.numberOfPeriod &&
            x.poolConfig.account.poolFees.baseFee.periodFrequency.eq(baseFeeParams.periodFrequency) &&
            x.feeCollectionToken === selectedFeeMode
        );

        pools = pools.filter(x => x.baseFee >= b - 0.02 && x.baseFee <= b + 0.02)
        if (pools.length !== 1) {
            console.log(pools.length)
            console.log(tokenAMint, tokenBMint)
            setSelectedPoolConfig(undefined);
            toast.error("Multiple configs found!");
            return;
        }

        setSelectedPoolConfig(pools[0]);
    }, [useDynamicFee, baseFeePercentage, useFeeScheduler, selectedFeeScheduler, selectedFeeMode]);

    useEffect(() => {
        if (tokenAMint && tokenBMint) {
            try {
                const aDecimals = tokenMetadata[tokenAMint].decimals;
                const bDecimals = tokenMetadata[tokenBMint].decimals;
                const quote = cpAmm.getDepositQuote({
                    isTokenA: true,
                    sqrtPrice: getSqrtPriceFromPrice(initialPrice.toString(), aDecimals, bDecimals),
                    inAmount: new BN(tokenAAmount.mul(Decimal.pow(10, aDecimals)).toString()),
                    maxSqrtPrice: MAX_SQRT_PRICE,
                    minSqrtPrice: MIN_SQRT_PRICE,
                })
                setTokenBAmount(new Decimal(quote.outputAmount.toString()).div(Decimal.pow(10, bDecimals)))

            } catch (e) {
                console.error(e);
                toast.error("Failed to get metadata for selected tokens!")

            }
        }
    }, [initialPrice, tokenAAmount]);

    useEffect(() => {
        updateCommonTokens();
        fetchPoolConfigs();
    }, []);

    return (
        <div className="space-y-2">
            <div className="relative w-full">
                <label className="block text-xs text-gray-400">Initial Price</label>
                <div className="flex">
                    <button
                        type="button"
                        onClick={handleFetchPrice}
                        className="flex min-w-20 items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white text-xs"
                    >
                        Get Price
                    </button>
                    <DecimalInput
                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                        value={initialPrice.toString()}
                        onChange={() => { }}
                        onBlur={e => setInitialPrice(e)}

                    />
                </div>
            </div>
            <button
                type="button"
                onClick={() => setPresetsDropdownOpen(!presetsDropdownOpen!)}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 text-white text-xs text-left flex justify-between items-center"
            >
                {"Select Preset"}
                <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {presetsDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-200 overflow-y-auto divide-y bg-gray-800 border border-gray-700 rounded-md shadow-lg">
                    {Presets
                        .map((x, i) => (
                            <div
                                key={i}
                                onClick={() => {
                                    setUseDynamicFee(x.useDynamicFee);
                                    setBaseFeePercentage(new Decimal(x.baseFee));
                                    setUseFeeScheduler(x.useScheduler);
                                    setSelectedFeeScheduler(x.feeSchedulerMode);
                                    setSelectedFeeMode(x.collectFeeMode);
                                    setPresetsDropdownOpen(false)
                                }}
                                className={`px-2 cursor-pointer hover:bg-gray-700 text-white text-xs`}
                            >
                                <div className="flex flex-col gap-0.5">
                                    {x.name.toString()}
                                </div>
                            </div>
                        ))}
                </div>
            )}
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
                    <label className="block text-xs text-gray-400">Base Fee (Fee Tier)</label>
                    <div className="flex">

                        <button
                            type="button"
                            onClick={() => setBaseFeeDropdownOpen(!baseFeeDropdownOpen)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 text-white text-xs text-left flex justify-between items-center"
                        >
                            {baseFeePercentage.toString() || "Select Tier"}
                            <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {baseFeeDropdownOpen && (
                            <div className="absolute z-50 mt-1 max-h-200 overflow-y-auto divide-y bg-gray-800 border border-gray-700 rounded-md shadow-lg">
                                {FeeTiers
                                    .map((x, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setBaseFeePercentage(new Decimal(x))
                                                setBaseFeeDropdownOpen(false)
                                            }}
                                            className={`px-2 cursor-pointer hover:bg-gray-700 text-white text-xs ${baseFeePercentage.eq(x) ? 'bg-gray-700' : ''
                                                }`}
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                {x.toString()}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="relative flex flex-cols w-full gap-1 bg-gray-800 border-t border-b border-r border-gray-700 rounded-md text-white text-xs">

                <input type='checkbox'
                    checked={useFeeScheduler}
                    onChange={(e) => setUseFeeScheduler(e.target.checked)}>
                </input>
                <label className="w-full select-none text-reado">

                    Use Fee Scheduler
                </label>
            </div>
            <div className='grid grid-cols-2 gap-1'>

                <div className="relative w-full">

                    <label className="block text-xs text-gray-400">Fee Schedule Mode</label>

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
                    <label className="block text-xs text-gray-400">Fee Collection Mode</label>

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
                    className="bg-green-600 hover:bg-green-500 px-2 rounded-xs text-white font-semibold text-xs"
                    onClick={() => handleCreatePool()}
                >
                    Create Pool
                </button>
                :
                <a
                    className="h-full bg-red-600 hover:bg-red-500 px-2 rounded-xs text-white font-semibold text-xs"
                    href={`https://edge.meteora.ag/dammv2/${newPoolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Pool Exists
                </a>}
        </div>
    )
}

export default SimplePoolCreation;