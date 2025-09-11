import React, { createContext, useContext, useEffect, useRef, useState, } from 'react'
import { useConnection } from '@jup-ag/wallet-adapter'
import { getDetailedPools, PoolSortType, sortPools, type PoolDetailedInfo, type PoolInfo, type PoolInfoMap } from '../constants';
import { PublicKey, type GetProgramAccountsFilter, type KeyedAccountInfo } from '@solana/web3.js';
import { useCpAmm } from './CpAmmContext';
import { fetchTokenMetadata, type TokenMetadataMap } from '../tokenUtils';
import { launchpads } from '../components/launchpads/Launchpads';
import { feeNumeratorToBps, getFeeNumerator } from '@meteora-ag/cp-amm-sdk';

interface PoolSorting {
    type: PoolSortType,
    ascending: boolean | undefined
}

interface DammV2PoolContextType {
    update: boolean,
    setUpdate: (u: boolean) => void,
    filteredDetailedPools: PoolDetailedInfo[];
    tokenMetadataMap: TokenMetadataMap;

    creatorAddressFilter: string;
    setCreatorAddressFilter: (s: string) => void;
    mainPoolFilter: string;
    setMainPoolFilter: (s: string) => void;
    poolAddressOrMintFilter: string;
    setPoolAddressOrMintFilter: (s: string) => void;
    launchpadFilter: Set<string>;
    setLaunchpadFilter: (s: Set<string>) => void;

    poolSorting: PoolSorting;
    setPoolSorting: (s: PoolSorting) => void;
}

const DammV2PoolContext = createContext<DammV2PoolContextType>({
    update: false,
    setUpdate: (_u: boolean) => { },
    filteredDetailedPools: [],
    tokenMetadataMap: {},

    creatorAddressFilter: "",
    setCreatorAddressFilter: (_s: string) => { },
    mainPoolFilter: "",
    setMainPoolFilter: (_s: string) => { },
    poolAddressOrMintFilter: "",
    setPoolAddressOrMintFilter: (_s: string) => { },
    launchpadFilter: new Set<string>(),
    setLaunchpadFilter: (_s: Set<string>) => { },

    poolSorting: { type: PoolSortType.PoolActivationTime, ascending: true },
    setPoolSorting: (_s: PoolSorting) => { },

});

const UPDATE_INTERVAL = 2000;
const MAX_SIMPLE_POOLS = 100;

export const useDammV2PoolsWebsocket = () => useContext(DammV2PoolContext)

export const DammV2PoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { connection } = useConnection();
    const { cpAmm } = useCpAmm();


    const currentSlot = useRef<number>(0)
    const updateTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

    const simplePoolsMap = useRef<PoolInfoMap>({});
    const filteredSimplePools = useRef<PoolInfo[]>([]);

    const additionlSimplePools = useRef<PoolInfo[]>([]);

    const detailedPools = useRef<PoolDetailedInfo[]>([]);
    const localFilteredDetailedPools = useRef<PoolDetailedInfo[]>([]);
    const [filteredDetailedPools, setFilteredDetailedPools] = useState(localFilteredDetailedPools.current)

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
        updateLoop(false);
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

    const [poolSorting, _setPoolSorting] = useState<PoolSorting>({ type: PoolSortType.PoolActivationTime, ascending: true })
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
        let currentSimplePools: PoolInfo[] = []
        if (additionlSimplePools.current && additionlSimplePools.current.length > 0)
            currentSimplePools = additionlSimplePools.current
        else
            currentSimplePools = Object.entries(simplePoolsMap.current).map((x) => x[1]);
        if (currentSimplePools.length == 0) {
            localFilteredDetailedPools.current = [];
            setFilteredDetailedPools(localFilteredDetailedPools.current)
            return;
        }
        //if (currentSimplePools.map(x => x.account.activationType).indexOf(0) >= 0)
        //currentSlot.current = await connection.getSlot();

        //use MAX_SIMPLE_POOLS sorted by activation time
        currentSimplePools = currentSimplePools.sort((x, y) =>
            (x.account.activationType === 0 ?
                (currentSlot.current - x.account.activationPoint.toNumber()) * 400 / 1000 :
                startTime - x.account.activationPoint.toNumber()) -
            (y.account.activationType === 0 ?
                (currentSlot.current - y.account.activationPoint.toNumber()) * 400 / 1000 :
                startTime - y.account.activationPoint.toNumber())
        )


        currentSimplePools = currentSimplePools.slice(0, MAX_SIMPLE_POOLS)

        filteredSimplePools.current = [...currentSimplePools];
        if (additionlSimplePools.current.length == 0) {
            filterByCreatorAddress();
            filterByMainPool()
            filterByPoolAddressOrMint();
        }

        const tokenAMints = filteredSimplePools.current.map(x => x.account.tokenAMint.toBase58());
        const tokenBMints = filteredSimplePools.current.map(x => x.account.tokenBMint.toBase58());
        const mints = [...new Set([...tokenAMints, ...tokenBMints])];

        //fech metadata for parsing
        if (fetchMetadata)
            tokenMetadataMap.current = await fetchTokenMetadata(mints);

        try {
        detailedPools.current = getDetailedPools(cpAmm, filteredSimplePools.current, tokenMetadataMap.current, currentSlot.current, startTime);
        } catch(e){
            console.error(e)
            console.log("fetched metadata? " + fetchMetadata);
        }
        localFilteredDetailedPools.current = [...detailedPools.current];
        filterByLaunchpad();
        sortDetailedPools();
        setFilteredDetailedPools(localFilteredDetailedPools.current)
    }

    const fetchPools = async () => {
        if (!connection) return
        const startTime = Date.now() / 1000;
        const slotNow = currentSlot.current;

        if (poolAddressOrMintFilterRef.current === "" && creatorAddressFilterRef.current === "") {
            additionlSimplePools.current = [];
            return;
        }

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
                    (currentSlot.current - x.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - x.account.activationPoint.toNumber()) -
                (y.account.activationType === 0 ?
                    (currentSlot.current - y.account.activationPoint.toNumber()) * 400 / 1000 :
                    startTime - y.account.activationPoint.toNumber())
            )

            additionlSimplePools.current = pools;

        } catch (e) {
            console.error(e)
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

    const filterByMainPool = () => {
        const filter = mainPoolFilterRef.current;
        console.log("Filtering by main pool: " + filter)
        const currentTime = Date.now() / 1000;
        //const startTime = Date.now();
        //const startPoolsCount = filteredSimplePools.current.length;

        filteredSimplePools.current = filteredSimplePools.current.filter(x => {
            const currentFee = feeNumeratorToBps(getFeeNumerator(
                x.account.activationType === 0 ? currentSlot.current :
                    x.account.activationType === 1 ? currentTime : 0,
                x.account.activationPoint,
                x.account.poolFees.baseFee.numberOfPeriod,
                x.account.poolFees.baseFee.periodFrequency,
                x.account.poolFees.baseFee.feeSchedulerMode,
                x.account.poolFees.baseFee.cliffFeeNumerator,
                x.account.poolFees.baseFee.reductionFactor,
                x.account.poolFees.dynamicFee
            ));

            if (filter === "Exclude")
                return currentFee > 1000;
            if (filter === "Only")
                return currentFee <= 1000;
            return true;
        })

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

    //remount websocket as connection changes
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

            if (updateRef.current === true)
                simplePoolsMap.current[e.accountId.toBase58()] = { publicKey: e.accountId, account: decoded };
        }, {
            encoding: 'jsonParsed',
            commitment: 'processed',
        });

        const slotChangeId = connection.onSlotChange((x) => {
            currentSlot.current = x.slot;
        })

        console.log("Dammv2Pool websocket mounted.")

        setUpdate(false);

        return () => {
            connection.removeProgramAccountChangeListener(programAccountChangeId);
            connection.removeSlotChangeListener(slotChangeId);
        }
    }, [connection]);
    return (
        <DammV2PoolContext.Provider value={{
            update, setUpdate, filteredDetailedPools, tokenMetadataMap: tokenMetadataMap.current,
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
