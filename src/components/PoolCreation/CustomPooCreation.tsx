import { useEffect, useState } from "react"
import Decimal from "decimal.js"
import { Keypair, PublicKey } from "@solana/web3.js"
import { CollectFeeMode, deriveCustomizablePoolAddress, FeeSchedulerMode, getBaseFeeParams, getDynamicFeeParams, getSqrtPriceFromPrice, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from "@meteora-ag/cp-amm-sdk"
import { DecimalInput } from "../Simple/DecimalInput"
import { NumberInput } from "../Simple/NumberInput"
import { formatDurationNumber } from "../../constants"
import { type TokenMetadataMap } from "../../tokenUtils"
import { BN } from "@coral-xyz/anchor"
import { useCpAmm } from "../../contexts/CpAmmContext"
import { useWallet } from "@jup-ag/wallet-adapter"
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { txToast } from "../Simple/TxToast"
import { useTransactionManager } from "../../contexts/TransactionManagerContext"
import { toast } from "sonner"
import { useDammUserPositions } from "../../contexts/DammUserPositionsContext"

interface CustomPoolCreationProps {

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
    maxFee: number,
    totalSchedulerDuration: number,
    schedulerReductionPeriod: number,
    feeSchedulerMode: FeeSchedulerMode,
    collectFeeMode: CollectFeeMode,
}

const Presets: Preset[] = [
    {
        name: "Endless 50%",
        useDynamicFee: true,
        baseFee: 0.01,
        maxFee: 50,
        totalSchedulerDuration: 48000000,
        schedulerReductionPeriod: 48000000,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    },
    {
        name: "Endless 40%",
        useDynamicFee: true,
        baseFee: 0.01,
        maxFee: 40,
        totalSchedulerDuration: 48000000,
        schedulerReductionPeriod: 48000000,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    },

    {
        name: "Endless 30%",
        useDynamicFee: true,
        baseFee: 0.01,
        maxFee: 30,
        totalSchedulerDuration: 48000000,
        schedulerReductionPeriod: 48000000,
        feeSchedulerMode: FeeSchedulerMode.Linear,
        collectFeeMode: CollectFeeMode.OnlyB,
    },
]

const CustomPoolCreation: React.FC<CustomPoolCreationProps> = (
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
    const { sendLegacyTxn } = useTransactionManager();
    const { refreshPositions } = useDammUserPositions();

    const [newPoolAddress, setNewPoolAddress] = useState<PublicKey | null>(null)
    const [newPoolAddressExists, setNewPoolAddressExists] = useState(false)

    const [initialPrice, setInitialPrice] = useState(new Decimal(0))

    const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false)

    const [useMaxPrice, setUseMaxPrice] = useState(false)
    const [maxPrice, setMaxPrice] = useState(new Decimal(0))

    const [useMinPrice, setUseMinPrice] = useState(false)
    const [minPrice, setMinPrice] = useState(new Decimal(0))

    const [useDynamicFee, setUseDynamicFee] = useState(true)

    const [maxBaseFeePercentage, setMaxBaseFeePercentage] = useState(new Decimal(50))

    const [baseFeePercentage, setBaseFeePercentage] = useState(new Decimal(0.01))

    const [totalSchedulerDuration, setTotalSchedulerDuration] = useState<number>(480000)

    const [schedulerReductionPeriod, setSchedulerReductionPeriod] = useState<number>(480000)

    const [selectedFeeScheduler, setSelectedFeeScheduler] = useState<FeeSchedulerMode>(FeeSchedulerMode.Linear)
    const [feeSchedulerDropdownOpen, setFeeSchedulerDropdownOpen] = useState(false)

    const [selectedFeeMode, setSelectedFeeMode] = useState<CollectFeeMode>(CollectFeeMode.OnlyB)
    const [feeModeDropdownOpen, setFeeModeDropdownOpen] = useState(false)

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

            const minSqrtPrice = (minPrice.greaterThan(0) && useMinPrice) ? getSqrtPriceFromPrice(minPrice.toString(), decimalsA, decimalsB) : MIN_SQRT_PRICE;
            const maxSqrtPrice = (maxPrice.greaterThan(0) && useMaxPrice) ? getSqrtPriceFromPrice(maxPrice.toString(), decimalsA, decimalsB) : MAX_SQRT_PRICE;

            const { liquidityDelta: initPoolLiquidityDelta, initSqrtPrice } =
                cpAmm.preparePoolCreationParams({
                    tokenAAmount: tokenAAmountDeposit,
                    tokenBAmount: tokenBAmountDeposit,
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
                tokenAAmount: tokenAAmountDeposit,
                tokenBAmount: tokenBAmountDeposit,
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
                await sendLegacyTxn(tx, [positionNft],
                    {
                        notify: true,
                        onSuccess: async () => {
                            txToast.showPool(pool.toBase58());
                            await refreshPositions();
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
    }, [tokenAMint, tokenBMint]);

    useEffect(() => {
        if (tokenAMint && tokenBMint && tokenMetadata[tokenAMint] && tokenMetadata[tokenBMint]) {
            try {
                const aDecimals = tokenMetadata[tokenAMint].decimals;
                const bDecimals = tokenMetadata[tokenBMint].decimals;
                const quote = cpAmm.getDepositQuote({
                    isTokenA: true,
                    sqrtPrice: getSqrtPriceFromPrice(initialPrice.toString(), aDecimals, bDecimals),
                    inAmount: new BN(tokenAAmount.mul(Decimal.pow(10, aDecimals)).toString()),
                    maxSqrtPrice: (useMaxPrice && maxPrice.greaterThan(0)) ?
                        getSqrtPriceFromPrice(maxPrice.toString(), aDecimals, bDecimals) :
                        MAX_SQRT_PRICE,
                    minSqrtPrice: (useMinPrice && minPrice.greaterThan(0)) ?
                        getSqrtPriceFromPrice(minPrice.toString(), aDecimals, bDecimals) :
                        MIN_SQRT_PRICE,
                })
                quote.outputAmount
                setTokenBAmount(new Decimal(quote.outputAmount.toString()).div(Decimal.pow(10, bDecimals)))

            } catch (e) {
                console.error(e);
                toast.error("Failed to get metadata for selected tokens!")

            }
        }
    }, [initialPrice, tokenAAmount, tokenMetadata, minPrice, maxPrice, useMinPrice, useMaxPrice]);

    useEffect(() => {
        updateCommonTokens();
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
                className=" bg-emerald-800 border border-emerald-700 rounded-xs px-2 text-white text-xs text-left flex justify-between items-center"
            >
                {"Select Preset"}
                <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {presetsDropdownOpen && (
                <div className="absolute z-50 -mt-2 max-h-200 gap-y-0.5 overflow-y-auto divide-y divide-gray-700 bg-gray-800 border border-gray-700 rounded-xs shadow-lg">
                    {Presets
                        .map((x, i) => (
                            <div
                                key={i}
                                onClick={async () => {
                                    setUseDynamicFee(x.useDynamicFee);
                                    setMaxBaseFeePercentage(new Decimal(x.maxFee))
                                    setBaseFeePercentage(new Decimal(x.baseFee));
                                    setSelectedFeeScheduler(x.feeSchedulerMode);
                                    setTotalSchedulerDuration(x.totalSchedulerDuration);
                                    setSchedulerReductionPeriod(x.schedulerReductionPeriod);
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
            <div className='grid grid-cols-2 gap-1'>
                <div className="relative w-full">
                    <div className='flex flex-cols gap-1'>
                        <input type='checkbox'
                            checked={useMaxPrice}
                            onChange={(e) => setUseMaxPrice(e.target.checked)}>
                        </input>
                        <label className="block text-xs text-gray-400">Max Price</label>

                    </div>
                    <div className="flex">
                        <DecimalInput
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                            placeholder="0"
                            value={maxPrice.toString()}
                            onChange={() => { }}
                            onBlur={setMaxPrice}
                        />
                    </div>
                </div>

                <div className="relative w-full">
                    <div className='flex flex-cols gap-1'>
                        <input type='checkbox'
                            checked={useMinPrice}
                            onChange={(e) => setUseMinPrice(e.target.checked)}>
                        </input>
                        <label className="block text-xs text-gray-400">Min Price</label>
                    </div>
                    <div className="flex">
                        <DecimalInput
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                            placeholder="0"
                            value={minPrice.toString()}
                            onChange={() => { }}
                            onBlur={setMinPrice}
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
                    <label className="block text-xs text-gray-400">Starting Fee</label>
                    <div className="flex">
                        <DecimalInput
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                            onChange={() => { }}
                            value={maxBaseFeePercentage.toString()}
                            onBlur={setMaxBaseFeePercentage}
                        />
                    </div>
                </div>

                <div className="relative w-full">
                    <label className="block text-xs text-gray-400">Base Fee (Fee Tier)</label>
                    <div className="flex">
                        <DecimalInput
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                            onChange={() => { }}
                            value={baseFeePercentage.toString()}
                            onBlur={setBaseFeePercentage}
                        />
                    </div>
                </div>
            </div>
            <div className="relative w-full">
                <label className="block text-xs text-gray-400">Scheduler Duration({formatDurationNumber(totalSchedulerDuration)})</label>
                <div className="flex">
                    <NumberInput
                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                        value={totalSchedulerDuration.toString()}
                        onChange={() => { }}
                        onBlur={setTotalSchedulerDuration}
                    />
                </div>
            </div>
            <div className="relative w-full">
                <label className="block text-xs text-gray-400">Scheduler Reduction Period({formatDurationNumber(schedulerReductionPeriod)})</label>
                <div className="flex">
                    <NumberInput
                        className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-md px-2 text-xs text-white placeholder-gray-500"
                        placeholder="2"
                        value={schedulerReductionPeriod.toString()}
                        onChange={() => { }}
                        onBlur={setSchedulerReductionPeriod}
                    />
                </div>
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

export default CustomPoolCreation;