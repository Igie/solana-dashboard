import React, { useEffect, useState } from 'react'
import { RefreshCcw, RefreshCw } from 'lucide-react'
import { CpAmm, feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice, getTokenProgram } from '@meteora-ag/cp-amm-sdk'
import { PublicKey, type KeyedAccountInfo, } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { fetchTokenMetadata, type TokenMetadataMap } from '../tokenUtils'
import Decimal from 'decimal.js'

import { type PoolDetailedInfo, type PoolInfo, type PoolInfoMap } from '../constants'
import Dammv2PoolList from './Simple/Dammv2PoolList'
import { useConnection } from '@jup-ag/wallet-adapter'

const Dammv2Browser: React.FC = () => {
    const { connection } = useConnection()

    //const { positions, totalLiquidityValue, loading, refreshPositions } = useDammUserPositions()
    const [websocketPools, setWebsocketPools] = useState<PoolInfo[]>([])
    const [pools, setPools] = useState<PoolInfo[]>([])
    const [newPools, setNewPools] = useState<PoolInfoMap>({});
    const [detailedPools, setDetailedPools] = useState<PoolDetailedInfo[]>([])
    const [fetchingPools, setFetchingPools] = useState(false)
    const [shouldRefreshPools, setShouldRefreshPools] = useState(false)

    const [tokenMetadataMap, setTokenMetadataMap] = useState<TokenMetadataMap>({});

    const [currentTime, setCurrentTime] = useState(new BN((Date.now())).divn(1000).toNumber());
    const [currentSlot, setCurrentSlot] = useState<number>(0);
    const [poolAddress, setPoolAddress] = useState('')

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

        const tm = await fetchTokenMetadata(connection, [pool.tokenAMint.toBase58(), pool.tokenBMint.toBase58()]);
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
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        setCurrentSlot(await connection.getSlot());
        let mints: string[] = [];
        try {
            const pools = await cpAmm.getAllPools();
            pools.sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber())
            const allPools = (pools).slice(0, 40); // Limit to first 40 pools

            mints.push(...allPools.map(p => p.account.tokenAMint.toBase58()));
            mints.push(...allPools.map(p => p.account.tokenBMint.toBase58()));
            mints = [...new Set(mints)]
            const tm = await fetchTokenMetadata(connection, mints);
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
                activationTime = ((currentSlot - x.account.activationPoint.toNumber()) * 400);
            } else {
                activationTime = currentTime - x.account.activationPoint.toNumber();
            }

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
                TVL: (poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price + poolTokenBAmount * tokenBMetadata.price),
                lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price + poolTokenBAmountLocked * tokenBMetadata.price,
                totalFees: poolTokenA.totalFees.add(poolTokenB.totalFees),
            });
        };
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
        let b = true;
        const timer = setInterval(() => {
            setDummyBool(!b);
            b = !b;
        }, 20000);

        return () => {
            clearInterval(timer);
        }
    }, []);

    useEffect(() => {
        if (Object.entries(newPools).length == 0) return;
        setCurrentTime(new BN((Date.now())).divn(1000).toNumber());
        let mints: string[] = []
        const poolInfoMap: PoolInfoMap = {};

        let newPoolsLocal: PoolInfoMap = {};
        //setNewPools(x => { newPoolsLocal = newPools; return x });
        newPoolsLocal = newPools;
        setNewPools({});
        for (const pool of Object.entries(newPoolsLocal).map(x => x[1])) {
            poolInfoMap[pool.publicKey.toBase58()] = pool;
        }

        //setPools(x => { poolsLocal = pools; return x });
        for (const pool of pools) {
            poolInfoMap[pool.publicKey.toBase58()] = pool;
        }

        let entries = Object.entries(poolInfoMap)
        const finalPools = entries.map(x => x[1]).sort((x, y) => y.account.activationPoint.sub(x.account.activationPoint).toNumber()).slice(0, 40);
        setPools(finalPools);
        mints.push(...finalPools.map(x => x.account.tokenAMint.toBase58()));
        mints.push(...finalPools.map(x => x.account.tokenBMint.toBase58()));
        mints = [...new Set(mints)]
        const newTokenMetadataMap = fetchTokenMetadata(connection, mints);
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

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2 justify-start">
                <button
                    onClick={fetchPools}
                    disabled={fetchingPools}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors"
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
                <label className='flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors'>
                    Auto Refresh <input type='checkbox'
                        checked={shouldRefreshPools}
                        onChange={(e) => setShouldRefreshPools(e.target.checked)}>

                    </input>
                </label>
                <span className='text-sm'>Automatically adds new pools to the list and refreshes metadata every 20 seconds, state changes happen automatically</span>
            </div>

            <div>
                <div className="relative w-full">
                    <label className="block text-sm text-gray-400 mb-1">Pool address</label>
                    <div className="flex" >
                        <button
                            type="button"
                            onClick={() => fetchPool(poolAddress)}
                            className="flex items-center justify-center px-3 py-2  bg-gray-700 border border-gray-600 rounded-l-md hover:bg-gray-600 text-white"
                            title="Refresh pools"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>
                        <input
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-4 py-2 text-white placeholder-gray-500"
                            placeholder="Enter pool address..."
                            value={poolAddress}
                            onChange={(e) => setPoolAddress(e.target.value.trim())}
                        />
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
                tokenMetadataMap={tokenMetadataMap} />
        </div>
    )
}
export default Dammv2Browser