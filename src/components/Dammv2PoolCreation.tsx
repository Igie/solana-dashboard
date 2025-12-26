import React, { useState } from 'react'
import { useEffect } from 'react'
import { RefreshCcw } from 'lucide-react'
import { BaseFeeMode, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { GetTokenMetadataMap, useTokenMetadata, type TokenMetadataMap } from '../contexts/TokenMetadataContext'
import Decimal from 'decimal.js'
import { MintSelectorInput } from './Simple/MintSelectorInput'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import Dammv2PoolList from './Simple/Dammv2PoolList'
import { getMinAndCurrentFee, getRateLimiter, type PoolDetailedInfo, type PoolInfo } from '../constants'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { useCpAmm } from '../contexts/CpAmmContext'
import { useGetSlot } from '../contexts/GetSlotContext'
import CustomPoolCreation from './PoolCreation/CustomPooCreation'
import SimplePoolCreation from './PoolCreation/SimplePoolCreation'

enum PoolCreationType {
    None,
    Simple,
    Custom
}

export interface Dammv2PoolCreationProps {
    tokenAMintParam: string | undefined
    tokenAAmountParam: Decimal | undefined
}

const Dammv2PoolCreation: React.FC<Dammv2PoolCreationProps> = ({
    tokenAMintParam,
    tokenAAmountParam,
}) => {
    const { connection } = useConnection()
    const { getSlot } = useGetSlot();
    const { connected } = useWallet()
    const { cpAmm } = useCpAmm();
    const { fetchTokenMetadata } = useTokenMetadata();
    const [searchMint, setSearchMint] = useState('')
    const { refreshTokenAccounts } = useTokenAccounts()

    const [pools, setPools] = useState<PoolInfo[]>([])
    const [detailedPools, setDetailedPools] = useState<PoolDetailedInfo[]>([])
    const [fetchingPools, setFetchingPools] = useState(false)
    const [tokenMetadataMap, setTokenMetadataMap] = useState<TokenMetadataMap>({});
    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber())

    const [poolCreationType, setPoolCreationType] = useState(PoolCreationType.Simple)

    const [tokenAMint, setTokenAMint] = useState(tokenAMintParam ? tokenAMintParam : "")
    const [tokenAAmount, setTokenAAmount] = useState<Decimal>(tokenAAmountParam ? tokenAAmountParam : new Decimal(0))

    const [tokenBMint, setTokenBMint] = useState("So11111111111111111111111111111111111111112")
    const [tokenBAmount, setTokenBAmount] = useState<Decimal>(new Decimal(0))

    const updateCommonTokens = async (): Promise<void> => {
        const poolTokens = Object.values(tokenMetadataMap);
        const { tokenMetadata } = await refreshTokenAccounts();
        setTokenMetadataMap(GetTokenMetadataMap([...new Set([...poolTokens, ...tokenMetadata])]));
    }

    const fetchPools = async () => {
        if (!connection) return
        setPoolCreationType(PoolCreationType.None);
        setTokenMetadataMap({});
        setPools([])
        mapPools([], {});
        setFetchingPools(true)
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        let mints: string[] = [];
        if (searchMint === '') {
            const pools = await cpAmm.getAllPools();
            pools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber())
            const allPools: PoolInfo[] = (pools).slice(0, 100);


            mints.push(...allPools.map(p => p.account.tokenAMint.toBase58()));
            mints.push(...allPools.map(p => p.account.tokenBMint.toBase58()));
            mints = [...new Set(mints)]
            const tm = await fetchTokenMetadata(mints);
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

        const related = allPools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber()).slice(0, 100);
        mints.push(...related.map(p => p.account.tokenAMint.toBase58()));
        mints.push(...related.map(p => p.account.tokenBMint.toBase58()));
        mints = [...new Set(mints)];
        const tm = await fetchTokenMetadata(mints);
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

            const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals));
            const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals));

            const poolTokenAAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const poolTokenBAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals));

            const poolTokenA = {
                ...tokenAMetadata,
                poolAmount: poolTokenAAmount,
                totalFeesUsd: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)).mul(tokenAMetadata?.price),
                totalFeesToken: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)),
            }

            const poolTokenB = {
                ...tokenBMetadata,
                poolAmount: poolTokenBAmount,
                totalFeesUsd: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),
                totalFeesToken: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)),
            }

            let activationTime = 0;
            if (x.account.activationType === 0) {
                activationTime = ((getSlot() - x.account.activationPoint.toNumber()) * 400 / 1000);
            } else {
                activationTime = currentTime - x.account.activationPoint.toNumber();
            }

            const currentTimeInActivation = x.account.activationType === 0 ? getSlot() :
                x.account.activationType === 1 ? currentTime : 0;

            const [minFee, currentFee] = getMinAndCurrentFee(x, currentTimeInActivation);

            detailedPools.push({
                poolInfo: x,
                tokenA: poolTokenA,
                tokenB: poolTokenB,
                age: activationTime,
                minFeeBPS: minFee,
                currentFeeBPS: currentFee,
                price: new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, poolTokenA.decimals, poolTokenB.decimals)),
                TVLUsd: poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmount.mul(tokenBMetadata.price).toNumber(),
                TVLUsdChange: 0,
                LiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
                lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmountLocked * tokenBMetadata.price.toNumber(),
                totalFeesUsd: poolTokenA.totalFeesUsd.add(poolTokenB.totalFeesUsd),
                FeesLiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
                rateLimiter: x.account.poolFees.baseFee.baseFeeInfo.data[8] === BaseFeeMode.RateLimiter ?
                    getRateLimiter(x, tokenBMetadata.decimals, currentTimeInActivation)
                    : null
            });
        };
        setDetailedPools(detailedPools);
    };

    useEffect(() => {
        updateCommonTokens();
    }, []);

    return (
        <div className="flex flex-col h-[calc(100vh-110px)] lg:h-[calc(100vh-55px)] space-y-1 px-2 md:px-0">
            <div className="bg-gray-900 border border-gray-700 rounded p-1 space-y-1">

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
            <div className="bg-gray-900 border border-gray-700 rounded p-1 space-y-1">
                {connected && (
                    <div className="flex items-center justify-center md:justify-start md:gap-1">
                        <button
                            disabled={poolCreationType === PoolCreationType.None}
                            onClick={() => { setPoolCreationType(PoolCreationType.None) }}
                            className={`${poolCreationType === PoolCreationType.None ?
                                "bg-indigo-600" :
                                "bg-purple-600 hover:bg-purple-500"} px-2 py-0.5 rounded-xs text-white text-xs font-medium`}
                        >
                            {"Hide Create Pool Form"}
                        </button>
                        <button
                            disabled={poolCreationType === PoolCreationType.Simple}
                            onClick={() => { setPoolCreationType(PoolCreationType.Simple) }}
                            className={`${poolCreationType === PoolCreationType.Simple ?
                                "bg-indigo-600" :
                                "bg-purple-600 hover:bg-purple-500"} px-2 py-0.5 rounded-xs text-white text-xs font-medium`}
                        >
                            {"Simple Form"}
                        </button>
                        <button
                            disabled={poolCreationType === PoolCreationType.Custom}
                            onClick={() => { setPoolCreationType(PoolCreationType.Custom) }}
                            className={`${poolCreationType === PoolCreationType.Custom ?
                                "bg-indigo-600" :
                                "bg-purple-600 hover:bg-purple-500"} px-2 py-0.5 rounded-xs text-white text-xs font-medium`}
                        >
                            {"Custom Form"}
                        </button>
                    </div>
                )}
                {poolCreationType !== PoolCreationType.None && connected && (
                    <div className="space-y-1">
                        <div className='grid grid-cols-2 gap-1'>
                            <div className="relative">
                                <label className="block text-xs text-gray-400" >Base Token</label>
                                <MintSelectorInput
                                    mint={tokenAMint}
                                    amount={tokenAAmount}
                                    onMintChange={(e) => {
                                        setTokenAMint(e);
                                    }
                                    }
                                    onAmountChange={(e) => {
                                        setTokenAAmount(e);
                                    }}
                                    onOpenDropdown={async () => await updateCommonTokens()}
                                />
                            </div>
                            <div className="relative">
                                <label className="block text-xs text-gray-400">Quote Token</label>
                                <MintSelectorInput
                                    mint={tokenBMint}
                                    amount={tokenBAmount}
                                    onMintChange={(e) => setTokenBMint(e)}
                                    onAmountChange={(e) => setTokenBAmount(e)}

                                    onOpenDropdown={async () => await updateCommonTokens()}
                                />
                            </div>
                        </div>
                        {poolCreationType === PoolCreationType.Simple &&
                            <SimplePoolCreation
                                tokenMetadata={tokenMetadataMap}

                                tokenAMint={tokenAMint}
                                tokenAAmount={tokenAAmount}
                                setTokenAAmount={setTokenAAmount}

                                tokenBMint={tokenBMint}
                                tokenBAmount={tokenBAmount}
                                setTokenBAmount={setTokenBAmount}

                                updateCommonTokens={updateCommonTokens}

                            />
                        }
                        {poolCreationType === PoolCreationType.Custom &&
                            <CustomPoolCreation
                                tokenMetadata={tokenMetadataMap}

                                tokenAMint={tokenAMint}
                                tokenAAmount={tokenAAmount}
                                setTokenAAmount={setTokenAAmount}

                                tokenBMint={tokenBMint}
                                tokenBAmount={tokenBAmount}
                                setTokenBAmount={setTokenBAmount}

                                updateCommonTokens={updateCommonTokens}

                            />
                        }
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
                pools={detailedPools}
                tokenMetadataMap={tokenMetadataMap} />
        </div>
    )
}
export default Dammv2PoolCreation
