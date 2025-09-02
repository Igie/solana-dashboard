import React, { useEffect, useState } from 'react'
import { RefreshCcw, RefreshCw } from 'lucide-react'
import { CpAmm, feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice, getTokenProgram } from '@meteora-ag/cp-amm-sdk'
import { PublicKey, type KeyedAccountInfo, } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { fetchTokenMetadataJup, type TokenMetadataMap } from '../tokenUtils'
import Decimal from 'decimal.js'

import { PoolSortType, sortPools, type PoolDetailedInfo, type PoolInfo, type PoolInfoMap } from '../constants'
import Dammv2PoolList from './Simple/Dammv2PoolList'
import { useConnection } from '@jup-ag/wallet-adapter'

const MainPoolFilters = ["Include", "Exclude", "Only"];
const bn0 = new BN(0);

const Dammv2Browser: React.FC = () => {
    const { connection } = useConnection()

    //const { positions, totalLiquidityValue, loading, refreshPositions } = useDammUserPositions()
    const [websocketPools, setWebsocketPools] = useState<PoolInfo[]>([])
    const [pools, setPools] = useState<PoolInfo[]>([])
    const [newPools, setNewPools] = useState<PoolInfoMap>({});
    const [detailedPools, setDetailedPools] = useState<PoolDetailedInfo[]>([])
    const [fetchingPools, setFetchingPools] = useState(false)
    const [shouldRefreshPools, setShouldRefreshPools] = useState(false)

    const [sortBy, setSortBy] = useState<PoolSortType>(PoolSortType.PoolActivationTime);
    const [sortAscending, setSortAscending] = useState<boolean | undefined>(true);

    const [mainPoolFilter, setMainPoolFilter] = useState("Exclude");

    const [tokenMetadataMap, setTokenMetadataMap] = useState<TokenMetadataMap>({});

    const [currentTime, setCurrentTime] = useState(0);
    const [currentSlot, setCurrentSlot] = useState(0);
    const [poolAddress, setPoolAddress] = useState('')
    const [poolCreatorAddress, setPoolCreatorAddress] = useState('')

    const cpAmm = new CpAmm(connection);

    const fetchPool = async (poolAddress: string) => {
        const poolKey = new PublicKey(poolAddress);
        if (!await cpAmm.isPoolExist(poolKey)) return;

        setFetchingPools(true)
        setCurrentTime((new BN((Date.now())).divn(1000).toNumber()));
        setCurrentSlot(await connection.getSlot());

        const pool = await cpAmm.fetchPoolState(poolKey)
        const accountPool = {
            publicKey: poolKey,
            account: pool,
        };

        const tm = await fetchTokenMetadataJup([pool.tokenAMint.toBase58(), pool.tokenBMint.toBase58()]);
        setTokenMetadataMap(tm);
        setPools([accountPool]);
        mapPools([accountPool], tm);
        setFetchingPools(false);
    }


    const fetchPools = async () => {
        if (!connection) return
        setTokenMetadataMap({});
        setPools([])
        mapPools([], {});
        setFetchingPools(true)

        const timeNow = new BN((Date.now())).divn(1000);
        const slotNow = await connection.getSlot();


        setCurrentTime(timeNow.toNumber());
        setCurrentSlot(slotNow);

        let mints: string[] = [];
        try {
            let pools = await cpAmm._program.account.pool.all(poolCreatorAddress !== "" ? [{
                memcmp: {
                    encoding: 'base58',
                    offset: 648,
                    bytes: poolCreatorAddress,
                }
            }] : undefined);

            if (mainPoolFilter !== "Include")
                pools = pools.filter(x => {
                    const currentFee = feeNumeratorToBps(getFeeNumerator(
                        x.account.activationType === 0 ? slotNow :
                            x.account.activationType === 1 ? currentTime : 0,
                        x.account.activationPoint,
                        x.account.poolFees.baseFee.numberOfPeriod,
                        x.account.poolFees.baseFee.periodFrequency,
                        x.account.poolFees.baseFee.feeSchedulerMode,
                        x.account.poolFees.baseFee.cliffFeeNumerator,
                        x.account.poolFees.baseFee.reductionFactor,
                        x.account.poolFees.dynamicFee
                    ));

                    if (mainPoolFilter === "Exclude")
                        return currentFee > 1000;
                    if (mainPoolFilter === "Only")
                        return currentFee <= 1000;
                    return true;

                }
                )
            pools = pools.filter(x => timeNow.sub(x.account.activationPoint).gte(bn0));
            pools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber())
            const allPools = pools.slice(0, 40); // Limit to first 40 pools

            mints.push(...allPools.map(p => p.account.tokenAMint.toBase58()));
            mints.push(...allPools.map(p => p.account.tokenBMint.toBase58()));
            mints = [...new Set(mints)]
            const tm = await fetchTokenMetadataJup(mints);
            setTokenMetadataMap(tm);
            setPools(allPools);
            mapPools(allPools, tm);
            setFetchingPools(false);
            return;
        } catch (err) {
            setTokenMetadataMap({});
            setPools([])
            mapPools([], {});
        }
        setFetchingPools(false)
    }

    const mapPools = (p: PoolInfo[], tm: TokenMetadataMap) => {
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
            if (!tokenAMetadata || !tokenBMetadata) continue;
            if (!tokenAMetadata)
                console.log("a is undefined", x.account.tokenAMint.toBase58());
            if (!tokenAMetadata)
                console.log("b is undefined", x.account.tokenBMint.toBase58());

            const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).toNumber();
            const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata?.decimals || 6)).toNumber();

            const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata?.decimals || 6, tokenBMetadata?.decimals || 6));

            const poolTokenA = {
                mint: x.account.tokenAMint.toBase58(),
                tokenProgram: getTokenProgram(x.account.tokenAFlag).toBase58(),
                symbol: tokenAMetadata?.symbol || 'UNK',
                name: tokenAMetadata?.name || 'Unknown',
                poolAmount: poolTokenAAmount,
                decimals: tokenAMetadata?.decimals,
                price: tokenAMetadata?.price,
                image: tokenAMetadata?.image || undefined,
                totalFees: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals || 6)).mul(tokenAMetadata?.price)
            }

            const poolTokenB = {
                mint: x.account.tokenBMint.toBase58(),
                tokenProgram: getTokenProgram(x.account.tokenBFlag).toBase58(),
                symbol: tokenBMetadata?.symbol || 'UNK',
                name: tokenBMetadata?.name || 'Unknown',
                poolAmount: poolTokenBAmount,
                decimals: tokenBMetadata?.decimals,
                price: tokenBMetadata?.price,
                image: tokenBMetadata?.image || undefined,
                totalFees: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price)
            }

            const poolTokenAAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
            const poolTokenBAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

            let activationTime = 0;
            if (x.account.activationType === 0) {
                activationTime = ((currentSlot - x.account.activationPoint.toNumber()) * 400 / 1000);
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
                TVL: (poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price + poolTokenBAmount * tokenBMetadata.price),
                lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price + poolTokenBAmountLocked * tokenBMetadata.price,
                totalFees: poolTokenA.totalFees.add(poolTokenB.totalFees),
            });
        };
        sortPools(detailedPools, sortBy, sortAscending);
        setDetailedPools(detailedPools);
    };

    const addOrQueuePool = async (newPool: PoolInfo) => {
        const existing = pools.find(x => x.publicKey.toBase58() == newPool.publicKey.toBase58());
        if (existing) {
            existing.account = newPool.account;
            const poolsLocal = pools;
            setPools([...pools]);
            mapPools(poolsLocal, tokenMetadataMap);
        } else if (shouldRefreshPools) {

            const newPoolsLocal = newPools;
            newPoolsLocal[newPool.publicKey.toBase58()] = newPool;
            setNewPools(newPoolsLocal);
        }
    }

    const [dummyBool, setDummyBool] = useState(true)
    useEffect(() => {
        if (!shouldRefreshPools) return;
        let b = true;
        const timeout = setTimeout(() => {
            setDummyBool(!b);
            b = !b;
            clearTimeout(timeout);
        }, 1000);
        const timer = setInterval(() => {
            setDummyBool(!b);
            b = !b;
        }, 2000);

        return () => {
            clearTimeout(timeout);
            clearInterval(timer);
        }
    }, [shouldRefreshPools]);

    useEffect(() => {
        if (Object.entries(newPools).length == 0) return;
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        const s = connection.getSlot()
        s.then((x) =>{
            setCurrentSlot(x);
        });
        let mints: string[] = []
        const poolInfoMap: PoolInfoMap = {};

        let newPoolsLocal: PoolInfoMap = {};
        //setNewPools(x => { newPoolsLocal = newPools; return x });
        newPoolsLocal = newPools;
        setNewPools({});


        for (const pool of Object.entries(newPoolsLocal).map(x => x[1])) {

            if (pool.account.activationType === 0 && pool.account.activationPoint.ltn(currentSlot))
                continue;


            if (pool.account.activationType === 1 && pool.account.activationPoint.ltn(currentTime))
                continue


            if (poolCreatorAddress !== "" && pool?.account.creator.toBase58() !== poolCreatorAddress)
                continue


            const currentFee = feeNumeratorToBps(getFeeNumerator(
                pool.account.activationType === 0 ? currentSlot :
                    pool.account.activationType === 1 ? currentTime : 0,
                pool.account.activationPoint,
                pool.account.poolFees.baseFee.numberOfPeriod,
                pool.account.poolFees.baseFee.periodFrequency,
                pool.account.poolFees.baseFee.feeSchedulerMode,
                pool.account.poolFees.baseFee.cliffFeeNumerator,
                pool.account.poolFees.baseFee.reductionFactor,
                pool.account.poolFees.dynamicFee
            ));
            if (mainPoolFilter === "Exclude" && currentFee <= 1000) {
                continue;
            }

            if (mainPoolFilter === "Only" && currentFee > 1000) {
                continue;
            }

            poolInfoMap[pool.publicKey.toBase58()] = pool;
        }

        //setPools(x => { poolsLocal = pools; return x });
        for (const pool of pools) {
            poolInfoMap[pool.publicKey.toBase58()] = pool;
        }

        let entries = Object.entries(poolInfoMap)
        const finalPools = entries.map(x => x[1]).sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber()).slice(0, 100);
        setPools(finalPools);
        mints.push(...finalPools.map(x => x.account.tokenAMint.toBase58()));
        mints.push(...finalPools.map(x => x.account.tokenBMint.toBase58()));
        mints = [...new Set(mints)]
        const newTokenMetadataMap = fetchTokenMetadataJup(mints);
        const oldTokenMetadataMap = tokenMetadataMap;
        newTokenMetadataMap.then((x) => {

            for (var entries of Object.entries(x))
                oldTokenMetadataMap[entries[0]] = entries[1];
            setTokenMetadataMap(oldTokenMetadataMap);
            mapPools(finalPools, oldTokenMetadataMap);
        });
    }, [dummyBool]);

    useEffect(() => {
        if (!connection.rpcEndpoint) return;
        const id = connection.onProgramAccountChange(new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"), (e: KeyedAccountInfo) => {
            const slice = e.accountInfo.data.readUint32BE(0);
            let found = false;
            let name = "";
            let decoded: any = undefined;
            for (var i of cpAmm._program.idl.accounts) {
                const buf = Buffer.from(i.discriminator);
                const bufInt = buf.readUint32BE();
                if (bufInt == slice) {
                    name = i.name;
                    decoded = cpAmm._program.coder.accounts.decode(i.name, e.accountInfo.data);
                    found = true;
                    break;
                }
            }
            if (!found) console.log(e.accountInfo);
            if (!found || name !== 'pool') return;


            setWebsocketPools([...websocketPools, { publicKey: e.accountId, account: decoded }]);
            //updatePool(existing, { publicKey: e.accountId, account: decoded });

            //console.log(e.accountInfo);
            //console.log();

        }, {
            encoding: 'jsonParsed',
            commitment: 'finalized',
        });

        return () => {
            connection.removeProgramAccountChangeListener(id);
        }
    }, [connection]);

    useEffect(() => {
        if (websocketPools.length == 0) return;

        const websocketPoolsLocal = websocketPools;
        const pool = websocketPoolsLocal.pop();
        setWebsocketPools(websocketPoolsLocal);
        if (!pool) return;

        addOrQueuePool(pool);
    }, [websocketPools]);

    useEffect(() =>{
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        const slot = connection.getSlot();
        slot.then((x) => {
            setCurrentSlot(x)
        });
    },[])

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-75px)] space-y-1 px-2 md:px-0">
            {/* Header */}
            <div className="flex md:grid justify-start items-stretch gap-1">
                <button
                    onClick={fetchPools}
                    disabled={fetchingPools}
                    className="flex items-center gap-1 px-2 w-full lg:max-w-40 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-md md:text-sm transition-colors"
                >
                    {fetchingPools ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    {fetchingPools ? (
                        "Refreshing..."
                    ) : (
                        "Refresh"
                    )}
                </button>
                <label className='flex items-center gap-1 px-2 w-full lg:max-w-40 bg-purple-600 hover:bg-purple-700 rounded-md md:text-sm transition-colors'>
                    <input type='checkbox'
                        checked={shouldRefreshPools}
                        onChange={(e) => setShouldRefreshPools(e.target.checked)}>
                    </input>
                    Auto Refresh
                </label>
            </div>

            <div className='grid grid-cols-2 gap-1'>
                <div className="relative w-full">
                    <label className="block text-sm text-gray-400">Pool address</label>
                    <div className="flex" >
                        <button
                            type="button"
                            onClick={() => fetchPool(poolAddress)}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Refresh pools"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        <input
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm placeholder-gray-500"
                            placeholder="Enter pool address..."
                            value={poolAddress}
                            onChange={(e) => setPoolAddress(e.target.value.trim())}
                        />
                    </div>
                </div>


                <div className="relative w-full">
                    <label className="block text-sm text-gray-400">Creator address</label>
                    <div className="flex" >
                        <button
                            type="button"
                            onClick={() => fetchPools()}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Refresh pools"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        <input
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm placeholder-gray-500"
                            placeholder="Filter new pools by creator..."
                            value={poolCreatorAddress}
                            onChange={(e) => setPoolCreatorAddress(e.target.value.trim())}
                        />
                    </div>
                </div>

            </div>
            <div className='grid md:grid-cols-2 lg:grid-cols-4 gap-1'>

                <div className="relative w-full">

                    <div className="grid grid-cols-2" >
                        <button
                            type="button"
                            onClick={() => {
                                setMainPoolFilter(MainPoolFilters[(MainPoolFilters.indexOf(mainPoolFilter)! + 1) % 3]);
                                setTokenMetadataMap({});
                                setPools([]);
                                setWebsocketPools([]);
                                mapPools([], {});
                            }}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Main Pool < 10% current fee"
                        >
                            {mainPoolFilter.toString()}
                        </button>
                        <div
                            className="bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm"
                        >
                            Main Pools
                        </div>
                    </div>
                </div>
            </div>
            {fetchingPools && (
                <div className="text-sm text-gray-400">Searching for pools...</div>
            )}

            {!fetchingPools && pools.length === 0 && (
                <div className="text-sm text-gray-500">No DAMMv2 pools found.</div>
            )}
            <Dammv2PoolList
                cpAmm={cpAmm}
                pools={detailedPools}
                tokenMetadataMap={tokenMetadataMap}
                sortParamsCallback={(sortType, ascending) => {
                    setSortBy(sortType);
                    setSortAscending(ascending);
                }} />
        </div>
    )
}
export default Dammv2Browser