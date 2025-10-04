import React, { createContext, useContext, useEffect, useRef, useState, } from 'react'
import { useConnection } from '@jup-ag/wallet-adapter'
import { getDetailedPools, PoolSortType, sortPools, type PoolDetailedInfo, type PoolInfo, type PoolInfoMap } from '../constants';
import { PublicKey, type GetProgramAccountsFilter, type KeyedAccountInfo } from '@solana/web3.js';
import { useCpAmm } from './CpAmmContext';
import { launchpads } from '../components/launchpads/Launchpads';
import { feeNumeratorToBps, getFeeNumerator } from '@meteora-ag/cp-amm-sdk';
import { BN } from '@coral-xyz/anchor';
import { useGetSlot } from './GetSlotContext';
import { useTokenMetadata, type TokenMetadataMap } from './TokenMetadataContext';

interface PoolSorting {
    type: PoolSortType,
    ascending: boolean | undefined
}

interface DammV2PoolContextType {
    update: boolean,
    setUpdate: (u: boolean) => void;

    fetchAllPools: (mints: string[] | undefined) => void;
    fetchingPools: boolean;

    filteredDetailedPools: PoolDetailedInfo[];
    updatedPools: PoolInfo[];

    tokenMetadataMap: TokenMetadataMap;

    creatorAddressFilter: string;
    setCreatorAddressFilter: (s: string) => void;
    mainPoolFilter: string;
    setMainPoolFilter: (s: string) => void;
    poolAddressOrMintFilter: string;
    setPoolAddressOrMintFilter: (s: string) => void;
    launchpadFilter: Set<string>;
    setLaunchpadFilter: (s: Set<string>) => void;

    poolSorting: PoolSorting | undefined;
    setPoolSorting: (s: PoolSorting) => void;
}

const DammV2PoolContext = createContext<DammV2PoolContextType>({
    update: false,
    setUpdate: (_u: boolean) => { },

    fetchAllPools: () => { },
    fetchingPools: false,

    filteredDetailedPools: [],
    updatedPools: [],
    tokenMetadataMap: {},

    creatorAddressFilter: "",
    setCreatorAddressFilter: (_s: string) => { },
    mainPoolFilter: "",
    setMainPoolFilter: (_s: string) => { },
    poolAddressOrMintFilter: "",
    setPoolAddressOrMintFilter: (_s: string) => { },
    launchpadFilter: new Set<string>(),
    setLaunchpadFilter: (_s: Set<string>) => { },

    poolSorting: undefined,
    setPoolSorting: (_s: PoolSorting) => { },
});

const UPDATE_INTERVAL = 4000;
const MAX_SIMPLE_POOLS = 200;

export const useDammV2PoolsWebsocket = () => useContext(DammV2PoolContext)

export const DammV2PoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { connection } = useConnection();
    const { cpAmm } = useCpAmm();
    const { getSlot } = useGetSlot();
    const { fetchTokenMetadata } = useTokenMetadata();
    const updateTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

    const [fetchingPools, setFetchingPools] = useState(false);


    const simpleMainPoolsMap = useRef<PoolInfoMap>({});
    const simpleNonMainPoolsMap = useRef<PoolInfoMap>({});

    const filteredSimplePools = useRef<PoolInfo[]>([]);

    const additionlSimplePools = useRef<PoolInfo[]>([]);

    const detailedPools = useRef<PoolDetailedInfo[]>([]);
    const localFilteredDetailedPools = useRef<PoolDetailedInfo[]>([]);
    const [filteredDetailedPools, setFilteredDetailedPools] = useState(localFilteredDetailedPools.current)

    const updatedPoolMap = useRef<PoolInfoMap>({});

    const [updatedPools, setUpdatedPools] = useState<PoolInfo[]>([])
    const tokenMetadataMap = useRef<TokenMetadataMap>({});


    const [creatorAddressFilter, _setCreatorAddressFilter] = useState("")

    const setCreatorAddressFilter = async (s: string) => {
        _setCreatorAddressFilter(s)
        creatorAddressFilterRef.current = s;
        await fetchPools();
        updateLoop(true);
    }
    const creatorAddressFilterRef = useRef(creatorAddressFilter)

    const [mainPoolFilter, _setMainPoolFilter] = useState("Exclude")
    const setMainPoolFilter = async (s: string) => {
        _setMainPoolFilter(s)
        mainPoolFilterRef.current = s;
        await fetchPools();
        updateLoop(true);
    }
    const mainPoolFilterRef = useRef(mainPoolFilter)

    const [poolAddressOrMintFilter, _setPoolAddressOrMintFilter] = useState("")
    const setPoolAddressOrMintFilter = async (s: string) => {
        _setPoolAddressOrMintFilter(s)
        poolAddressOrMintFilterRef.current = s;
        await fetchPools();
        updateLoop(true);
    }
    const poolAddressOrMintFilterRef = useRef(poolAddressOrMintFilter)

    const [launchpadFilter, _setLaunchpadFilter] = useState(new Set(Object.entries(launchpads).map(x => x[0])))
    const setLaunchpadFilter = async (s: Set<string>) => {
        _setLaunchpadFilter(s)
        launchpadFilterRef.current = s;
        await fetchPools();
        updateLoop(false);
    }
    const launchpadFilterRef = useRef(launchpadFilter)

    const [poolSorting, _setPoolSorting] = useState<PoolSorting>(
        {
            type: PoolSortType.PoolActivationTime,
            ascending: true
        }
    )
    const setPoolSorting = (s: PoolSorting) => {
        _setPoolSorting(s)
        poolSortingRef.current = s;
    }
    const poolSortingRef = useRef(poolSorting)

    const [update, _setUpdate] = useState(false)

    const setUpdate = async (u: boolean) => {
        updateRef.current = u;
        if (u) {
            updateLoop(true);
        } else {
            clearTimeout(updateTimeout.current)
        }
        _setUpdate(u);

    }
    const updateRef = useRef(update)

    //loop to use after calling startUpdate
    const updateLoop = async (fetchMetadata: boolean) => {
        await updateCallback(fetchMetadata);
        clearTimeout(updateTimeout.current);
        if (updateRef.current === true)
            updateTimeout.current = setTimeout(updateLoop, UPDATE_INTERVAL, true);
    }

    const updateCallback = async (fetchMetadata: boolean) => {
        const startTime = Date.now() / 1000;
        const slotNow = getSlot();
        const maxSlotBnNow = new BN(slotNow).addn(10);
        const maxTimeBnNow = new BN(startTime).addn(5);

        setFetchingPools(true);

        setUpdatedPools(Object.entries(updatedPoolMap.current).map(x => x[1]));
        updatedPoolMap.current = {};

        let currentSimplePools: PoolInfo[] = []
        if (additionlSimplePools.current && additionlSimplePools.current.length > 0)
            currentSimplePools = additionlSimplePools.current
        else {
            if (mainPoolFilterRef.current === "Exclude")
                currentSimplePools = Object.entries(simpleNonMainPoolsMap.current).map((x) => x[1]);
            if (mainPoolFilterRef.current === "Only")
                currentSimplePools = Object.entries(simpleMainPoolsMap.current).map((x) => x[1]);
            if (mainPoolFilterRef.current === "Include")
                currentSimplePools = [
                    ...Object.entries(simpleNonMainPoolsMap.current).map((x) => x[1]),
                    ...Object.entries(simpleMainPoolsMap.current).map((x) => x[1])
                ]
        }
        if (currentSimplePools.length == 0) {
            localFilteredDetailedPools.current = [];
            setFilteredDetailedPools(localFilteredDetailedPools.current);
            setFetchingPools(false);
            return;
        }

        currentSimplePools = currentSimplePools.filter(x => {
            if (x.account.activationType === 0)
                if (x.account.activationPoint < maxSlotBnNow)
                    return true;
            if (x.account.activationType === 1)
                if (x.account.activationPoint < maxTimeBnNow)
                    return true;
            return false;
        });

        currentSimplePools = currentSimplePools.sort((x, y) =>
            (x.account.activationType === 0 ?
                (slotNow - x.account.activationPoint.toNumber()) * 400 / 1000 :
                startTime - x.account.activationPoint.toNumber()) -
            (y.account.activationType === 0 ?
                (slotNow - y.account.activationPoint.toNumber()) * 400 / 1000 :
                startTime - y.account.activationPoint.toNumber())
        )

        filteredSimplePools.current = [...currentSimplePools];
        if (additionlSimplePools.current.length == 0) {
            filterByCreatorAddress();
            filterByPoolAddressOrMint();
        }
        filteredSimplePools.current = filteredSimplePools.current.slice(0, MAX_SIMPLE_POOLS)


        const tokenAMints = filteredSimplePools.current.map(x => x.account.tokenAMint.toBase58());
        const tokenBMints = filteredSimplePools.current.map(x => x.account.tokenBMint.toBase58());
        const mints = [...new Set([...tokenAMints, ...tokenBMints])];

        if (fetchMetadata) {
            tokenMetadataMap.current = await fetchTokenMetadata(mints);
        }
        try {
            detailedPools.current = getDetailedPools(cpAmm, filteredSimplePools.current, tokenMetadataMap.current, slotNow, startTime);
        } catch (e) {
            console.error(e)
            console.log("fetched metadata? " + fetchMetadata);
        }
        localFilteredDetailedPools.current = [...detailedPools.current];
        filterByLaunchpad();
        sortDetailedPools();
        setFilteredDetailedPools(localFilteredDetailedPools.current)
        setFetchingPools(false);
    }

    const fetchPools = async () => {
        if (!connection) return

        if (poolAddressOrMintFilterRef.current === "" && creatorAddressFilterRef.current === "") {
            additionlSimplePools.current = [];
            return;
        }
        if (fetchingPools) return;

        const startTime = Date.now() / 1000;
        const slotNow = getSlot();
        const maxSlotBnNow = new BN(slotNow).addn(10);
        const maxTimeBnNow = new BN(startTime).addn(5);

        setFetchingPools(true);
        const filters: GetProgramAccountsFilter[] = []
        if (creatorAddressFilterRef.current !== "")
            filters.push({
                memcmp: {
                    encoding: 'base58',
                    offset: 648,
                    bytes: creatorAddressFilterRef.current,
                }
            })

        let poolExists = false;

        if (poolAddressOrMintFilterRef.current) {

            try {
                const publicKey = new PublicKey(poolAddressOrMintFilterRef.current);
                poolExists = await cpAmm.isPoolExist(publicKey);
            } catch { }

            if (!poolExists) {
                filters.push({
                    memcmp: {
                        encoding: 'base58',
                        offset: 168,
                        bytes: poolAddressOrMintFilterRef.current,
                    }
                })

                filters.push({
                    memcmp: {
                        encoding: 'base58',
                        offset: 168 + 32,
                        bytes: poolAddressOrMintFilterRef.current,
                    }
                })
            }
        }

        try {
            const poolsMap: PoolInfoMap = {};
            let pools: PoolInfo[] = [];
            if (creatorAddressFilterRef.current === "" && poolAddressOrMintFilterRef.current === "")
                pools = await cpAmm._program.account.pool.all();
            else {
                for (const f of filters) {
                    const filtered = await cpAmm._program.account.pool.all([f]);
                    for (var p of filtered)
                        poolsMap[p.publicKey.toBase58()] = p;
                }

                if (poolExists) {
                    const poolPublicKey = new PublicKey(poolAddressOrMintFilterRef.current)
                    poolsMap[poolAddressOrMintFilterRef.current] =
                    {
                        publicKey: poolPublicKey,
                        account: await cpAmm.fetchPoolState(poolPublicKey),
                    };
                }

                pools = Object.entries(poolsMap).map(x => x[1]);
            }

            pools = pools.filter(x => {
                if (x.account.activationType === 0)
                    if (x.account.activationPoint < maxSlotBnNow)
                        return true;
                if (x.account.activationType === 1)
                    if (x.account.activationPoint < maxTimeBnNow)
                        return true;
                return false;
            })

            if (mainPoolFilterRef.current !== "Include")
                pools = pools.filter(x => {
                    const currentFee = feeNumeratorToBps(getFeeNumerator(
                        x.account.activationType === 0 ? slotNow :
                            x.account.activationType === 1 ? startTime : 0,
                        x.account.activationPoint,
                        x.account.poolFees.baseFee.numberOfPeriod,
                        x.account.poolFees.baseFee.periodFrequency,
                        x.account.poolFees.baseFee.feeSchedulerMode,
                        x.account.poolFees.baseFee.cliffFeeNumerator,
                        x.account.poolFees.baseFee.reductionFactor,
                        x.account.poolFees.dynamicFee
                    ));

                    if (mainPoolFilterRef.current === "Exclude")
                        return currentFee > 1000;
                    if (mainPoolFilterRef.current === "Only")
                        return currentFee <= 1000;
                    return true;
                })

            pools = pools.sort((x, y) =>
                (x.account.activationType === 0 ?
                    (slotNow - x.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - x.account.activationPoint.toNumber()) -
                (y.account.activationType === 0 ?
                    (slotNow - y.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - y.account.activationPoint.toNumber())
            )

            additionlSimplePools.current = pools;

        } catch (e) {
            console.error(e);
        }
        finally {
            setFetchingPools(false);
        }
    }

    const fetchAllPools = async (mints: string[] | undefined) => {
        if (!connection || fetchingPools) return
        const mintsSet = new Set(mints !== undefined ? [...mints] : []);
        setFetchingPools(true);
        const startTime = Date.now() / 1000;
        const slotNow = getSlot();
        const maxSlotBnNow = new BN(slotNow).addn(10);
        const maxTimeBnNow = new BN(startTime).addn(5);
        try {

            let pools: PoolInfo[] = [];
            pools = await cpAmm._program.account.pool.all();

            pools = pools.filter(x => {
                if (x.account.activationType === 0)
                    if (x.account.activationPoint < maxSlotBnNow)
                        return true;
                if (x.account.activationType === 1)
                    if (x.account.activationPoint < maxTimeBnNow)
                        return true;
                return false;
            })

            pools = pools.sort((x, y) =>
                (x.account.activationType === 0 ?
                    (slotNow - x.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - x.account.activationPoint.toNumber()) -
                (y.account.activationType === 0 ?
                    (slotNow - y.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - y.account.activationPoint.toNumber())
            )

            simpleMainPoolsMap.current = {};
            simpleNonMainPoolsMap.current = {};
            let countMainPools = 0;
            let countNonMainPools = 0;

            for (const x of pools) {
                if (mintsSet.size > 0 && !mintsSet.has(x.account.tokenAMint.toBase58()))
                    continue;
                const currentFee = feeNumeratorToBps(getFeeNumerator(
                    x.account.activationType === 0 ? slotNow :
                        x.account.activationType === 1 ? startTime : 0,
                    x.account.activationPoint,
                    x.account.poolFees.baseFee.numberOfPeriod,
                    x.account.poolFees.baseFee.periodFrequency,
                    x.account.poolFees.baseFee.feeSchedulerMode,
                    x.account.poolFees.baseFee.cliffFeeNumerator,
                    x.account.poolFees.baseFee.reductionFactor,
                    x.account.poolFees.dynamicFee
                ));

                if (currentFee <= 1000 && countMainPools < MAX_SIMPLE_POOLS) {
                    simpleMainPoolsMap.current[x.publicKey.toBase58()] = x;
                    countMainPools++;
                }
                if (currentFee > 1000 && countNonMainPools < MAX_SIMPLE_POOLS) {
                    simpleNonMainPoolsMap.current[x.publicKey.toBase58()] = x;
                    countNonMainPools++;
                }
                if (countMainPools >= MAX_SIMPLE_POOLS && countNonMainPools >= MAX_SIMPLE_POOLS)
                    break;
            }

            await updateCallback(true);
        } catch (e) {
            console.error(e);
        } finally {
            setFetchingPools(false);
        }
    }

    const filterByCreatorAddress = () => {
        if (!creatorAddressFilterRef.current || creatorAddressFilterRef.current === "") return;
        //const startTime = Date.now();
        console.log("Filtering by creator address: " + creatorAddressFilterRef.current)
        //const startPoolsCount = filteredSimplePools.current.length;
        filteredSimplePools.current = filteredSimplePools.current.filter(x => {
            return x.account.creator.toBase58() === creatorAddressFilterRef.current;
        });

        //console.log(`Filter result: ${Date.now() - startTime}ms, filtered out ${filteredSimplePools.current.length - startPoolsCount} pools.`)
    }

    const filterByPoolAddressOrMint = () => {
        if (!poolAddressOrMintFilterRef.current || poolAddressOrMintFilterRef.current === "") return;
        //const startTime = Date.now();
        console.log("Filtering by pool address or mint: " + poolAddressOrMintFilterRef.current)
        //const startPoolsCount = poolAddressOrMintFilterRef.current.length;
        filteredSimplePools.current = filteredSimplePools.current.filter(x => {
            return x.publicKey.toBase58() === poolAddressOrMintFilterRef.current ||
                x.account.tokenAMint.toBase58() === poolAddressOrMintFilterRef.current ||
                x.account.tokenBMint.toBase58() === poolAddressOrMintFilterRef.current;
        });

        //console.log(`Filter result: ${Date.now() - startTime}ms, filtered out ${poolAddressOrMintFilterRef.current.length - startPoolsCount} pools.`)
    }

    const filterByLaunchpad = () => {
        if (!launchpadFilterRef.current) return;
        //const startTime = Date.now();
        //console.log("Filtering by launchpad: " + launchpadFilterRef.current.size)
        //const startPoolsCount = localFilteredDetailedPools.current.length;
        localFilteredDetailedPools.current = localFilteredDetailedPools.current.filter(x => {

            return x.tokenA.launchpad === undefined || x.tokenA.launchpad === "" || launchpadFilterRef.current.has(x.tokenA.launchpad);
        });

        //console.log(`Filter result: ${Date.now() - startTime}ms, filtered out ${startPoolsCount - localFilteredDetailedPools.current.length} pools.`)
    }

    const sortDetailedPools = () => {
        sortPools(localFilteredDetailedPools.current, poolSortingRef.current.type, poolSortingRef.current.ascending)
    }

    useEffect(() => {
        console.log("Mounting Dammv2Pools websocket")
        if (!connection.rpcEndpoint) return;
        const programAccountChangeId = connection.onProgramAccountChange(new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"), (e: KeyedAccountInfo) => {
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
            if (!found || name !== 'pool') return;
            const accountInfo = { publicKey: e.accountId, account: decoded };
            //console.log(positions.map(x => x.poolInfo.publicKey.toBase58()))
            //if (positions.find(x => x.poolInfo.publicKey.toBase58() === e.accountId.toBase58())) {
            updatedPoolMap.current[accountInfo.publicKey.toBase58()] = accountInfo;
            //console.log("added pool ", e.accountId.toBase58());
            //}

            if (updateRef.current === true) {

                const currentFee = feeNumeratorToBps(getFeeNumerator(
                    decoded.activationType === 0 ? getSlot() :
                        decoded.activationType === 1 ? Date.now() / 1000 : 0,
                    decoded.activationPoint,
                    decoded.poolFees.baseFee.numberOfPeriod,
                    decoded.poolFees.baseFee.periodFrequency,
                    decoded.poolFees.baseFee.feeSchedulerMode,
                    decoded.poolFees.baseFee.cliffFeeNumerator,
                    decoded.poolFees.baseFee.reductionFactor,
                    decoded.poolFees.dynamicFee
                ));

                if (currentFee > 1000)
                    simpleNonMainPoolsMap.current[e.accountId.toBase58()] = accountInfo;
                else
                    simpleMainPoolsMap.current[e.accountId.toBase58()] = accountInfo;
            }
        }, {
            encoding: 'jsonParsed',
            commitment: 'processed',
        });

        console.log("Dammv2Pool websocket mounted.")

        setUpdate(false);

        return () => {
            connection.removeProgramAccountChangeListener(programAccountChangeId);
        }
    }, [connection]);
    return (
        <DammV2PoolContext.Provider value={{
            update, setUpdate, fetchAllPools, fetchingPools,
            filteredDetailedPools, updatedPools,
            tokenMetadataMap: tokenMetadataMap.current,
            creatorAddressFilter, setCreatorAddressFilter,
            mainPoolFilter, setMainPoolFilter,
            poolAddressOrMintFilter, setPoolAddressOrMintFilter,
            launchpadFilter, setLaunchpadFilter,
            poolSorting, setPoolSorting
        }}>
            {children}
        </DammV2PoolContext.Provider>
    )
}
