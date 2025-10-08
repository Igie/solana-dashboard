import { Copy, ExternalLink, PanelsTopLeft, TargetIcon, X } from "lucide-react";
import { SortArrow } from "./SortArrow";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { DepositPopover } from "./Dammv2DepositPopover";
import React, { useEffect, useState } from "react";
import { GetTokenAccountMap, useTokenAccounts, type TokenAccountMap } from "../../contexts/TokenAccountsContext";
import { formatDuration, formatDurationNumber, getAllPoolPositions, getShortMint, PoolSortType, sortPools, toUsd, type PoolDetailedInfo, type PoolPositionInfo, type PoolPositionInfoMap } from "../../constants";
import { useWallet } from "@jup-ag/wallet-adapter";
import { getPoolPositionMap, useDammUserPositions } from "../../contexts/DammUserPositionsContext";
import { DynamicTable, type Column } from "./DynamicTable";
import { launchpads } from "./../launchpads/Launchpads";
import { useGetSlot } from "../../contexts/GetSlotContext";
import { useCpAmm } from "../../contexts/CpAmmContext";
import type { TokenMetadataMap } from "../../contexts/TokenMetadataContext";
interface Dammv2PoolListProps {
    pools: PoolDetailedInfo[]
    tokenMetadataMap: TokenMetadataMap,
    sortParamsCallback?: (sortType: PoolSortType, ascending: boolean | undefined) => void,
}

enum TargetType {
    None,
    PoolInfo,
    UserInfo
}

interface DisplayTarget {
    target: string | PoolDetailedInfo,
    type: TargetType
}

const Dammv2PoolList: React.FC<Dammv2PoolListProps> = (
    {
        pools,
        tokenMetadataMap,
        sortParamsCallback,
    }
) => {
    const { getSlot } = useGetSlot();
    const { cpAmm } = useCpAmm();
    const { publicKey, connected } = useWallet();
    const { allTokenAccounts, refreshTokenAccounts } = useTokenAccounts();
    const { positions } = useDammUserPositions();

    const [tokenAccountMap, setTokenAccountMap] = useState<TokenAccountMap>({});
    const [userPoolPositionInfoMap, setUserPoolPositionInfoMap] = useState<PoolPositionInfoMap>({});

    const [sortBy, setSortBy] = useState<PoolSortType>(PoolSortType.PoolActivationTime);
    const [sortAscending, setSortAscending] = useState<boolean | undefined>(true);

    const [popoverIndex, setPopoverIndex] = useState<number | null>(null);
    const [depositPool, setDepositPool] = useState<PoolDetailedInfo | null>(null);

    const [target, setTarget] = useState<DisplayTarget>({ target: "", type: TargetType.None });

    const [poolPositions, setPoolPositions] = useState<{ owner: PublicKey, position: PoolPositionInfo }[]>([]);

    const handleSort = (sortType: PoolSortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        sortPools(pools, sortType, ascending)
    };


    const poolColumns: Column<PoolDetailedInfo>[] = [
        {
            header: 'Links',
            render: (pool, index) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        <button
                            className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-start gap-1"
                            onClick={async () => {
                                const poolPositions = await getAllPoolPositions(cpAmm, pool, getSlot());
                                setPoolPositions(poolPositions);


                                setTarget({ target: pool, type: TargetType.PoolInfo });

                            }}
                        >
                            <div className="flex gap-1 items-center justify-center">
                                <TargetIcon size={12} />
                            </div>
                        </button>

                    </div>
                    <div className="grid gap-1">
                        <div className="flex gap-0.5 w-max">
                            <a
                                className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                                href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Pool
                                <ExternalLink size={12} />
                            </a>
                            <button
                                className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(pool.poolInfo.publicKey.toBase58());
                                }}
                            >
                                <div className="flex gap-1 items-center justify-center">
                                    <Copy size={12} />
                                </div>
                            </button>
                        </div>
                        <a
                            className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                            href={`https://gmgn.ai/sol/token/NQhHUcmQ_${pool.tokenA.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            GMGN
                            <ExternalLink size={12} />
                        </a>
                    </div>
                    <div className="grid gap-1">
                        <a
                            className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                            href={`https://www.dextools.io/app/en/solana/pair-explorer/${pool.poolInfo.publicKey.toBase58()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            DexTools
                            <ExternalLink size={12} />
                        </a>
                        <a
                            className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                            href={`https://axiom.trade/t/${pool.tokenA.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Axiom
                            <ExternalLink size={12} />
                        </a>
                    </div>
                    <div className="grid w-full min-w-35 gap-1">
                        <button
                            disabled={!connected}
                            className={`${tokenAccountMap[pool.tokenA.mint] ? "bg-indigo-900 hover:bg-indigo-800" : "bg-blue-900 hover:bg-blue-800"} text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-start gap-1`}
                            onClick={() => {
                                window.Jupiter.init({
                                    formProps: {
                                        initialInputMint: pool.poolInfo.account.tokenBMint.toBase58(),
                                        initialOutputMint: pool.poolInfo.account.tokenAMint.toBase58(),
                                        initialAmount: (0.01 * LAMPORTS_PER_SOL).toString(),
                                    },
                                    onSuccess: async () => {
                                        await refreshTokenAccounts();
                                    }
                                });
                            }}
                        >
                            <div className="flex gap-1 items-center justify-center">
                                Jup Trade
                                <PanelsTopLeft size={12} />
                            </div>
                            {tokenAccountMap[pool.tokenA.mint] && tokenAccountMap[pool.tokenA.mint].amount.greaterThan(0) && (
                                <span>{tokenAccountMap[pool.tokenA.mint].amount.toFixed(2)}</span>
                            )}
                        </button>
                        <button
                            disabled={!connected}
                            className={`${userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()] ? "bg-indigo-900 hover:bg-indigo-800 text-lime-400" : "bg-blue-900 hover:bg-blue-800 text-gray-100"} text-xs py-0.5 px-1 rounded flex items-center justify-start gap-1`}
                            onClick={() => {
                                setDepositPool(pool);
                                setPopoverIndex(index)
                            }}
                        >
                            <div className="flex gap-1 items-center justify-center">
                                <span>Deposit</span>
                                <PanelsTopLeft size={12} />
                            </div>
                            {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()] && (
                                <span>
                                    {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()].positionValue.toFixed(2) + "$ (" + userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()].shareOfPoolPercentage + "%)"}
                                </span>
                            )}
                        </button>
                        {popoverIndex === index && (
                            <DepositPopover
                                className={"absolute flex flex-col z-50 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-sm p-1 gap-1 text-sm justify-center"}
                                owner={publicKey!}
                                positionInfo={positions.find(x => x.poolInfo.publicKey.toBase58() === depositPool?.poolInfo.publicKey.toBase58()) || null}
                                poolInfo={depositPool!.poolInfo}
                                onClose={() => {
                                    if (window.innerWidth < 1024) return;
                                    console.log("desktop close")
                                    setPopoverIndex(null)
                                }}
                            />
                        )}
                    </div>
                </div>
            )
        },
        {
            header: 'Pair',
            render: (pool) => (
                <div className="flex text-center justify-center font-mono">
                    <div className="grid w-max">
                        <div className="flex">
                            {pool.tokenA.launchpad !== undefined && (
                                <div className="flex justify-start">

                                    <div className="max-w-5 max-h-5 object-scale-down">
                                        {
                                            (() => {
                                                if (!pool.tokenA.launchpad) return "";
                                                const launchpad = launchpads[pool.tokenA.launchpad];
                                                if (launchpad) {
                                                    const Logo = launchpads[pool.tokenA.launchpad].logo || null;
                                                    if (!Logo) return "";
                                                    return <Logo />;
                                                } else console.log(pool.tokenA.launchpad, pool.tokenA.mint)
                                                return "";
                                            })()
                                        }
                                    </div>
                                </div>)}
                            <div className="flex flex-grow items-center justify-center text-xs">
                                {pool.tokenA.symbol.slice(0, 10) + (pool.tokenA.symbol.length > 10 ? "..." : "")}/
                                {pool.tokenB.symbol.slice(0, 10) + (pool.tokenB.symbol.length > 10 ? "..." : "")}
                            </div>
                        </div>
                        <div className="flex gap-1 w-max">
                            <button
                                className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(pool.poolInfo.account.tokenAMint.toBase58());
                                }}
                            >
                                <div className="flex gap-1 items-center justify-center">
                                    <span>{getShortMint(pool.poolInfo.account.tokenAMint)}</span>
                                </div>
                            </button>
                            <button
                                disabled={!connected}
                                className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(pool.poolInfo.account.tokenBMint.toBase58());
                                }}
                            >
                                <div className="flex gap-1 items-center justify-center">
                                    <span>{getShortMint(pool.poolInfo.account.tokenBMint)}</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )
        },
        {
            header: 'Creator',
            render: (pool) => (
                <div className="flex justify-center font-mono">
                    <div className="flex gap-0.5 w-max">
                        <a
                            className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                            href={`https://solscan.io/account/${pool.poolInfo.account.creator.toBase58()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {getShortMint(pool.poolInfo.account.creator)}
                            <ExternalLink size={12} />
                        </a>
                        <button
                            className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                            onClick={async () => {
                                await navigator.clipboard.writeText(pool.poolInfo.account.creator.toBase58());
                            }}
                        >
                            <div className="flex gap-1 items-center justify-center">
                                <Copy size={12} />
                            </div>
                        </button>
                    </div>
                </div>
            )
        },
        {
            header: 'Fee Mode',
            render: (pool) => (
                <div className="flex items-center justify-center text-xs gap-1">
                    <div className="text-center">
                        {pool.poolInfo.account.collectFeeMode === 0 ? <div className="text-red-400">Both </div> :
                            pool.poolInfo.account.collectFeeMode === 1 ? <div className="text-green-400">Quote </div> : "Unknown"}
                    </div>
                    <div className="flex justify-center -space-x-2">

                        {pool.poolInfo.account.collectFeeMode === 0 && (
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                                {pool.tokenA.image ? (
                                    <img src={pool.tokenA.image} alt={pool.tokenA.symbol} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-gray-100 font-bold text-[10px]">
                                        {pool.tokenA.symbol.slice(0, 2)}
                                    </div>
                                )}
                            </div>)}
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                            {pool.tokenB.image ? (
                                <img src={pool.tokenB.image} alt={pool.tokenB.symbol} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-gray-100 font-bold text-[10px]">
                                    {pool.tokenB.symbol.slice(0, 2)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            )
        },
        {
            header: 'Scheduler',
            render: (pool) => (
                <div className="text-center">
                    {pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode === 0 ? "Linear" :
                        pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode === 1 ? "Exponential" : "Unknown"}
                </div>
            )
        },
        {
            header: <div className="flex items-center justify-center">
                Pool Age
                {SortArrow<PoolSortType>(PoolSortType.PoolActivationTime, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {formatDurationNumber(pool.age)}
                </div>
            )
        },

        {
            header: <div className="flex items-center justify-center">
                First Pool Age
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {pool.tokenA.createdAt ? formatDurationNumber((Date.now() - pool.tokenA.createdAt!.getTime()) / 1000) : "Unknown"}
                </div>
            )
        },

        {
            header: 'TVL',
            render: (pool) => (
                <div className="grid grid-cols-2 gap-0.5 text-center text-md min-w-35">
                    <div >
                        {"$" + pool.TVLUsd.toFixed(2)}
                    </div>
                    {!pool.LiquidityChange.tokenBAmount.eq(0) && pool.TVLUsdChange> 0 && (
                        <div className="text-green-700">{`+$${pool.TVLUsdChange.toFixed(2)}`}</div>
                    )}
                    {pool.LiquidityChange.tokenBAmount.eq(0) && (
                        <div />
                    )}
                    {!pool.LiquidityChange.tokenBAmount.eq(0) && pool.TVLUsdChange < 0 && (
                        <div className="text-red-700">{`-$${(pool.TVLUsdChange * -1).toFixed(2)}`}</div>
                    )}
                </div>
            )
        },
        {

            header: <div className="flex items-center justify-center">
                Base Fee
                {SortArrow<PoolSortType>(PoolSortType.PoolBaseFee, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {pool.baseFeeBPS / 100}%
                </div>
            )
        },
        {

            header: <div className="flex items-center justify-center">
                Current Fee
                {SortArrow<PoolSortType>(PoolSortType.PoolCurrentFee, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {pool.totalFeeBPS / 100}%
                </div>
            )
        },
        {

            header: <div className="flex items-center justify-center">
                Fees Earned
                {SortArrow<PoolSortType>(PoolSortType.PoolTotalFees, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="grid grid-cols-2 gap-0.5 text-center text-md min-w-35">
                    <div >
                        {"$" + pool.totalFeesUsd.toFixed(2)}
                    </div>
                    {(pool.FeesLiquidityChange.tokenAAmount.greaterThan(0) || pool.FeesLiquidityChange.tokenBAmount.greaterThan(0)) ? (
                        <div className="text-green-700">{`+$${toUsd(pool.FeesLiquidityChange, pool).toFixed(2)}`}</div>
                    ) : (
                        <div />
                    )}
                </div>

            )
        },
    ]

    const positionColumns: Column<{ owner: PublicKey, position: PoolPositionInfo }>[] = [
        {
            header: 'NFT Account',
            render: (x) => (
                <div className="flex justify-center font-mono">
                    <div className="flex gap-0.5 w-max">
                        <a
                            className="bg-blue-900 hover:bg-blue-800 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center gap-1"
                            href={`https://solscan.io/account/${x.position.positionNftAccount.toBase58()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {getShortMint(x.position.positionNftAccount)}
                            <ExternalLink size={12} />
                        </a>

                    </div>
                </div>
            )
        },
        {
            header: 'Share',
            render: (x) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        {x.position.shareOfPoolPercentage + "%"}
                    </div>
                </div>
            )
        },
        {
            header: 'Value',
            render: (x) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        {"$" + x.position.positionValue.toFixed(2)}
                    </div>
                </div>
            )
        },
        {
            header: 'Claimed fee',
            render: (x) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        {"$" + x.position.positionClaimedFee.toFixed(2)}
                    </div>
                </div>
            )
        },
        {
            header: 'Unclaimed fee',
            render: (x) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        {"$" + x.position.positionUnclaimedFee.toFixed(2)}
                    </div>
                </div>
            )
        }
    ]

    useEffect(() => {
        setTokenAccountMap(GetTokenAccountMap(allTokenAccounts));
    }, [allTokenAccounts]);

    useEffect(() => {
        setUserPoolPositionInfoMap(getPoolPositionMap(positions));
    }, [positions]);

    useEffect(() => {
        if (sortParamsCallback)
            sortParamsCallback(sortBy, sortAscending)
    }, [sortBy, sortAscending]);

    return (
        <div className="flex flex-col h-full min-h-65 items-center overflow-hidden">
            {target.type !== TargetType.None && (
                <div className="flex gap-1 py-1">
                    <button
                        className="bg-red-600 hover:bg-red-500 text-gray-100 text-xs py-0.5 px-1 rounded grid items-left justify-start gap-1"
                        onClick={() => {
                            setTarget({ target: "", type: TargetType.None });

                        }}
                    >
                        <div className="flex gap-1 items-center justify-start">
                            <X size={12} />
                        </div>
                    </button>
                    {target.type == TargetType.PoolInfo && (
                        <div className="flex gap-1">
                            <div className="flex flex-grow items-center justify-center text-xs">
                                {(target.target as PoolDetailedInfo).tokenA.symbol.slice(0, 10) + ((target.target as PoolDetailedInfo).tokenA.symbol.length > 10 ? "..." : "")}/
                                {(target.target as PoolDetailedInfo).tokenB.symbol.slice(0, 10) + ((target.target as PoolDetailedInfo).tokenB.symbol.length > 10 ? "..." : "")}
                            </div>
                            <a
                                className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                                href={`https://edge.meteora.ag/dammv2/${(target.target as PoolDetailedInfo).poolInfo.publicKey.toBase58()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >

                                Pool
                                <ExternalLink size={12} />
                            </a>

                        </div>

                    )}
                    {target.type == TargetType.UserInfo && (
                        <div>
                            <a
                                className="bg-purple-800 hover:bg-purple-600 text-gray-100 text-xs py-0.5 px-1 rounded flex items-center justify-end gap-1"
                                href={`https://edge.meteora.ag/dammv2/${(target.target as PoolDetailedInfo).poolInfo.publicKey.toBase58()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Pool
                                <ExternalLink size={12} />
                            </a>
                        </div>
                    )}
                </div>
            )}
            {target.type === TargetType.PoolInfo && (
                <div className="overflow-y-auto items-center justify-center bg-gray-900 border border-gray-700 rounded p-3 md:p-3 space-y-2">

                    <DynamicTable tableClassName="hidden lg:table sticky" data={poolPositions} columns={positionColumns} hideHeaders={false} />
                </div>

            )}

            {pools.length > 0 && target.type === TargetType.None && (
                <div className="flex md:flex-row flex-col h-full flex-grow overflow-y-auto relative bg-gray-900 border border-gray-700 rounded p-1 md:p-1 space-y-1">
                    {target.type === TargetType.None &&
                        (<DynamicTable tableClassName="hidden lg:table sticky" data={pools} columns={poolColumns} hideHeaders={false} />
                        )}
                    {/* Mobile Sort Controls */}
                    <div className="lg:hidden mb-4">
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="text-gray-400">Sort by:</span>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolActivationTime ? 'bg-purple-600' : 'bg-gray-700'} text-gray-100`}
                                onClick={() => handleSort(PoolSortType.PoolActivationTime, true)}
                            >
                                Activation
                            </button>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolCurrentFee ? 'bg-purple-600' : 'bg-gray-700'} text-gray-100`}
                                onClick={() => handleSort(PoolSortType.PoolCurrentFee)}
                            >
                                Current Fee
                            </button>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolTotalFees ? 'bg-purple-600' : 'bg-gray-700'} text-gray-100`}
                                onClick={() => handleSort(PoolSortType.PoolTotalFees)}
                            >
                                Total Fees
                            </button>
                        </div>
                    </div>



                    <div className="flex-grow space-y-2 divide-y-2 overflow-y-auto">
                        {pools.map((pool, index) => (
                            <div key={index} className="lg:hidden space-y-1">
                                {/* Token Info */}
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1 w-full text-xs">
                                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                            <span className="text-xs text-gray-400 w-12">Base:</span>
                                            <span className="text-xs font-mono truncate min-w-0">
                                                {(tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.symbol &&
                                                    tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.symbol.length > 15)
                                                    ? tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.symbol.slice(0, 15) + '...'
                                                    : tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.symbol ||
                                                    (pool.poolInfo.account.tokenAMint.toBase58().slice(0, 4) + '...')
                                                }
                                            </span>
                                            <button
                                                className="bg-gray-600 hover:bg-gray-500 px-1 py-0.5 rounded text-xs flex-shrink-0"
                                                onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenAMint.toBase58())}
                                            >
                                                {getShortMint(pool.poolInfo.account.tokenAMint)}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                            <span className="text-xs text-gray-400 w-12">Quote:</span>
                                            <span className="text-xs font-mono truncate min-w-0">
                                                {(tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.symbol &&
                                                    tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.symbol.length > 15)
                                                    ? tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.symbol.slice(0, 15) + '...'
                                                    : tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.symbol ||
                                                    (pool.poolInfo.account.tokenBMint.toBase58().slice(0, 4) + '...')
                                                }
                                            </span>
                                            <button
                                                className="bg-gray-600 hover:bg-gray-500 px-1 py-0.5 rounded text-xs flex-shrink-0"
                                                onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenBMint.toBase58())}
                                            >
                                                {getShortMint(pool.poolInfo.account.tokenBMint)}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Pool Stats */}
                                <div className="grid grid-cols-2 gap-1 text-xs">
                                    <div>
                                        <span className="text-gray-400">TVL: </span>
                                        <span className="truncate">${pool.TVLUsd.toFixed(2)}</span>
                                    </div>
                                    <div className="min-w-0 flex gap-1 justify-end">
                                        <span className="text-gray-400">Activation: </span>
                                        <span className="truncate">
                                            {formatDuration(pool.age)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Base Fee: </span>
                                        <span className="truncate">{pool.baseFeeBPS / 100}%</span>
                                    </div>
                                    <div className="min-w-0 flex gap-1 justify-end">
                                        <span className="text-gray-400">Current Fee: </span>
                                        <span className="truncate">
                                            {(pool.totalFeeBPS / 100).toString().length > 6
                                                ? (pool.totalFeeBPS / 100).toString().slice(0, 6) + '...'
                                                : pool.totalFeeBPS / 100
                                            }%
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Fee Mode: </span>
                                        <span className="truncate">
                                            {pool.poolInfo.account.collectFeeMode === 0 ? "Both Tokens" :
                                                pool.poolInfo.account.collectFeeMode === 1 ? "Quote Token" : "Unknown"}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex gap-1 justify-end">
                                        <span className="text-gray-400">Scheduler: </span>
                                        <span className="truncate">
                                            {(() => {
                                                const schedulerText = pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode === 0 ? "Linear" :
                                                    pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode === 1 ? "Exponential" : "Unknown";
                                                return schedulerText.length > 10 ? schedulerText.slice(0, 10) + '...' : schedulerText;
                                            })()}
                                        </span>
                                    </div>
                                </div>

                                {/* Fee Info */}
                                <div className="grid grid-cols-3 gap-1 text-xs">
                                    <div className="text-center bg-gray-700 rounded">
                                        <div className="text-gray-400">Token A Fees</div>
                                        <div>${pool.tokenA.totalFeesUsd.toFixed(2)}</div>
                                    </div>
                                    <div className="text-center bg-gray-700 rounded">
                                        <div className="text-gray-400">Token B Fees</div>
                                        <div>${pool.tokenB.totalFeesUsd.toFixed(2)}</div>
                                    </div>
                                    <div className="text-center bg-gray-700 rounded">
                                        <div className="text-gray-400">Total Fees</div>
                                        <div>${pool.totalFeesUsd.toFixed(2)}</div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid grid-cols-2 gap-1">
                                        <a
                                            className="bg-purple-600 hover:bg-purple-500 text-gray-100 text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Pool
                                            <ExternalLink size={12} />
                                        </a>
                                        <a
                                            className="bg-purple-600 hover:bg-purple-500 text-gray-100 text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            href={`https://gmgn.ai/sol/token/NQhHUcmQ_${pool.tokenA.mint}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            GMGN
                                            <ExternalLink size={12} />
                                        </a>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <button
                                            disabled={!connected}
                                            className="bg-blue-900 hover:bg-blue-700 disabled:bg-gray-600 text-gray-100 text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            onClick={() => {
                                                window.Jupiter.init({
                                                    formProps: {
                                                        initialInputMint: pool.poolInfo.account.tokenBMint.toBase58(),
                                                        initialOutputMint: pool.poolInfo.account.tokenAMint.toBase58(),
                                                        initialAmount: (0.01 * LAMPORTS_PER_SOL).toString(),
                                                    },
                                                    onSuccess: async () => {
                                                        await refreshTokenAccounts();
                                                    }
                                                });
                                            }}
                                        >
                                            Trade
                                            <PanelsTopLeft size={12} />
                                        </button>
                                        <button
                                            disabled={!connected}
                                            className="bg-blue-900 hover:bg-blue-700 disabled:bg-gray-600 text-gray-100 text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            onClick={() => {
                                                setDepositPool(pool);
                                                setPopoverIndex(index);
                                            }}
                                        >
                                            Deposit
                                            <PanelsTopLeft size={12} />
                                        </button>
                                    </div>

                                </div>
                                {popoverIndex === index && (
                                    <DepositPopover
                                        className={"absolute flex flex-col z-50 top-0 bg-[#0d111c] text-gray-100 border border-gray-700 rounded-sm p-1 gap-1 text-sm justify-center"}
                                        owner={publicKey!}
                                        positionInfo={positions.find(x => x.poolInfo.publicKey.toBase58() === depositPool?.poolInfo.publicKey.toBase58()) || null}
                                        poolInfo={depositPool!.poolInfo}
                                        onClose={() => {
                                            if (window.innerWidth >= 1024) return;
                                            console.log("mobile close")
                                            setPopoverIndex(null)
                                        }}
                                    />
                                )}

                                {/* Balance/Position Info */}
                                {(tokenAccountMap[pool.tokenA.mint] || userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()]) && (
                                    <div className="flex justify-between text-xs bg-gray-700 p-2 rounded">
                                        {tokenAccountMap[pool.tokenA.mint] && (
                                            <div>
                                                <span className="text-gray-400">Balance: </span>
                                                <span>{tokenAccountMap[pool.tokenA.mint].amount.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()] && (
                                            <div>
                                                <span className="text-gray-400">Position: </span>
                                                <span>${userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()].positionValue.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default Dammv2PoolList