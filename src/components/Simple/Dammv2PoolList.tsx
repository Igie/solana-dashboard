import { ExternalLink, PanelsTopLeft } from "lucide-react";
import { SortArrow } from "./SortArrow";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DepositPopover } from "./Dammv2DepositPopover";
import { useEffect, useState } from "react";
import { useTokenAccounts } from "../../contexts/TokenAccountsContext";
import type { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { useTransactionManager } from "../../contexts/TransactionManagerContext";
import { GetTokenAccountMap, type TokenAccountMap, type TokenMetadataMap } from "../../tokenUtils";
import { formatDuration, getShortMint, PoolSortType, sortPools, type PoolDetailedInfo } from "../../constants";
import { useWallet } from "@jup-ag/wallet-adapter";
import { getPoolPositionMap, useDammUserPositions, type PoolPositionInfoMap } from "../../contexts/DammUserPositionsContext";
import { DynamicTable, type Column } from "./DynamicTable";

interface Dammv2PoolListProps {
    cpAmm: CpAmm
    pools: PoolDetailedInfo[]
    tokenMetadataMap: TokenMetadataMap,
    sortParamsCallback?: (sortType: PoolSortType, ascending: boolean | undefined) => void,
}

const Dammv2PoolList: React.FC<Dammv2PoolListProps> = (
    {
        cpAmm,
        pools,
        tokenMetadataMap,
        sortParamsCallback,
    }
) => {
    const { publicKey, connected } = useWallet();
    const { sendTxn } = useTransactionManager();
    const { tokenAccounts, refreshTokenAccounts } = useTokenAccounts();
    const { positions, refreshPositions } = useDammUserPositions();

    const [tokenAccountMap, setTokenAccountMap] = useState<TokenAccountMap>({});
    const [userPoolPositionInfoMap, setUserPoolPositionInfoMap] = useState<PoolPositionInfoMap>({});

    const [sortBy, setSortBy] = useState<PoolSortType>(PoolSortType.PoolActivationTime);
    const [sortAscending, setSortAscending] = useState<boolean | undefined>(true);

    const [popoverVisible, setPopoverVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [depositPool, setDepositPool] = useState<PoolDetailedInfo | null>(null);

    const handleSort = (sortType: PoolSortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        sortPools(pools, sortType, ascending)
    };

    const handleDepositClick = async (e: React.MouseEvent) => {
        await refreshTokenAccounts();
        const rect = (e.target as HTMLElement).getBoundingClientRect();

        // Calculate smart position that stays within viewport
        const calculatePosition = (buttonRect: DOMRect) => {
            const popoverWidth = 320; // Adjust based on your actual popover width
            const popoverHeight = 400; // Adjust based on your actual popover height
            const padding = 16; // Minimum distance from viewport edges

            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight,
                scrollY: window.scrollY,
                scrollX: window.scrollX
            };

            // Initial position below the button
            let x = buttonRect.left + window.scrollX;
            let y = buttonRect.bottom + window.scrollY;

            // Adjust horizontal position if popover would extend beyond right edge
            if (x + popoverWidth > viewport.scrollX + viewport.width - padding) {
                x = viewport.scrollX + viewport.width - popoverWidth - padding;
            }

            // Adjust horizontal position if popover would extend beyond left edge
            if (x < viewport.scrollX + padding) {
                x = viewport.scrollX + padding;
            }

            // Check if popover would extend beyond bottom edge
            if (y + popoverHeight > viewport.scrollY + viewport.height - padding) {
                // Try positioning above the button instead
                const yAbove = buttonRect.top + window.scrollY - popoverHeight;

                if (yAbove >= viewport.scrollY + padding) {
                    // Position above if there's enough space
                    y = yAbove;
                } else {
                    // If no space above or below, position at the bottom of viewport
                    y = Math.max(
                        viewport.scrollY + padding,
                        Math.min(y, viewport.scrollY + viewport.height - popoverHeight - padding)
                    );
                }
            }

            return { x: Math.round(x), y: Math.round(y) };
        };

        const position = calculatePosition(rect);
        setPosition(position);
        setPopoverVisible(true);
    };

    const poolColumns: Column<PoolDetailedInfo>[] = [
        {
            header: 'Links',
            render: (pool) => (
                <div className="flex w-full justify-center gap-1">
                    <div className="grid gap-1">
                        <a
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-1 px-1 rounded flex items-center justify-end gap-1"
                            href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Pool
                            <ExternalLink size={12} />
                        </a>
                        <a
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-1 px-1 rounded flex items-center justify-end gap-1"
                            href={`https://gmgn.ai/sol/token/NQhHUcmQ_${pool.tokenA.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            GMGN
                            <ExternalLink size={12} />
                        </a>
                    </div>
                    <div className="grid w-full gap-1">
                        <button
                            disabled={!connected}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 px-1 rounded flex items-center justify-start gap-1"
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
                            {tokenAccountMap[pool.tokenA.mint] && (
                                <span>{tokenAccountMap[pool.tokenA.mint].amount.toFixed(2)}</span>
                            )}
                        </button>
                        <button
                            disabled={!connected}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 px-1 rounded flex items-center justify-start gap-1"
                            onClick={(e) => {
                                setDepositPool(pool);
                                handleDepositClick(e);
                            }}
                        >
                            <div className="flex gap-1 items-center justify-center">
                                <span>Deposit</span>
                                <PanelsTopLeft size={12} />
                            </div>
                            {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()] && (
                                <span>
                                    {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()].positionValue.toFixed(2) + "$"}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )
        },
        {
            header: 'Pair',
            render: (pool) => (
                <div className="text-center font-mono">
                    <div className="grid w-max">
                        {pool.tokenA.symbol || getShortMint(pool.poolInfo.account.tokenAMint)}/
                        {pool.tokenB.symbol || getShortMint(pool.poolInfo.account.tokenBMint)}
                        <div className="flex gap-1 w-max">
                            <button
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 px-1 rounded flex items-center gap-1"
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
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 px-1 rounded flex items-center gap-1"
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
            header: 'Fee Mode',
            render: (pool) => (
                <div className="flex justify-center gap-1">
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
                                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-[10px]">
                                        {pool.tokenA.symbol.slice(0, 2)}
                                    </div>
                                )}
                            </div>)}
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                            {pool.tokenB.image ? (
                                <img src={pool.tokenB.image} alt={pool.tokenB.symbol} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[10px]">
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
            header: <div>
                Activation Time
                {SortArrow<PoolSortType>(PoolSortType.PoolActivationTime, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {formatDuration(pool.activationTime)} ago
                </div>
            )
        },

        {
            header: 'TVL',
            render: (pool) => (
                <div className="text-center">
                    ${pool.TVL.toFixed(2)}
                </div>
            )
        },
        {

            header: <div>
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

            header: <div>
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

            header: <div>
                Fees Generated
                {SortArrow<PoolSortType>(PoolSortType.PoolTotalFees, sortBy, sortAscending, handleSort)}
            </div>,
            render: (pool) => (
                <div className="text-center">
                    {"$" + pool.totalFees.toFixed(2)}

                </div>
            )
        },
    ]

    useEffect(() => {
        refreshTokenAccounts();
        refreshPositions();
    }, []);

    useEffect(() => {
        setTokenAccountMap(GetTokenAccountMap(tokenAccounts));
    }, [tokenAccounts]);

    useEffect(() => {
        setUserPoolPositionInfoMap(getPoolPositionMap(positions));
    }, [positions]);

    useEffect(() => {
        if (sortParamsCallback)
            sortParamsCallback(sortBy, sortAscending)
    }, [sortBy, sortAscending]);

    return (
        <div className="flex flex-col overflow-hidden">
            {pools.length > 0 && (
                <div className="flex-grow overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl p-3 md:p-3 space-y-2">
                    <DynamicTable tableClassName="hidden lg:table sticky" data={pools} columns={poolColumns} />

                    {/* Mobile Sort Controls */}
                    <div className="lg:hidden mb-4">
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="text-gray-400">Sort by:</span>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolActivationTime ? 'bg-purple-600' : 'bg-gray-700'} text-white`}
                                onClick={() => handleSort(PoolSortType.PoolActivationTime, true)}
                            >
                                Activation
                            </button>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolCurrentFee ? 'bg-purple-600' : 'bg-gray-700'} text-white`}
                                onClick={() => handleSort(PoolSortType.PoolCurrentFee)}
                            >
                                Current Fee
                            </button>
                            <button
                                className={`px-2 py-1 rounded ${sortBy === PoolSortType.PoolTotalFees ? 'bg-purple-600' : 'bg-gray-700'} text-white`}
                                onClick={() => handleSort(PoolSortType.PoolTotalFees)}
                            >
                                Total Fees
                            </button>
                        </div>
                    </div>

                    {popoverVisible && (
                        <DepositPopover
                            cpAmm={cpAmm}
                            owner={publicKey!}
                            poolInfo={depositPool}
                            onClose={() => setPopoverVisible(false)}
                            position={position}
                            sendTransaction={async (x, nft) => {
                                let success = false;
                                await sendTxn(x, [nft], {
                                    notify: true,
                                    onSuccess: () => {
                                        success = true;
                                    }
                                })
                                return success;
                            }}
                        />
                    )}

                    <div className="flex-grow space-y-2 divide-y-2 overflow-y-auto">
                        {pools.slice(0, Math.min(60, pools.length)).map((pool, index) => (
                            <div key={index} className="lg:hidden space-y-1">
                                {/* Token Info */}
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1 w-full">
                                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                            <span className="text-xs text-gray-400 w-12">Base:</span>
                                            <span className="text-sm font-mono truncate min-w-0">
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
                                            <span className="text-sm font-mono truncate min-w-0">
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
                                        <span className="truncate">${pool.TVL.toFixed(2)}</span>
                                    </div>
                                    <div className="min-w-0 flex gap-1 justify-end">
                                        <span className="text-gray-400">Activation: </span>
                                        <span className="truncate">
                                            {formatDuration(pool.activationTime).length > 8
                                                ? formatDuration(pool.activationTime).slice(0, 8) + '...'
                                                : formatDuration(pool.activationTime)
                                            } ago
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
                                        <div>${pool.tokenA.totalFees.toFixed(2)}</div>
                                    </div>
                                    <div className="text-center bg-gray-700 rounded">
                                        <div className="text-gray-400">Token B Fees</div>
                                        <div>${pool.tokenB.totalFees.toFixed(2)}</div>
                                    </div>
                                    <div className="text-center bg-gray-700 rounded">
                                        <div className="text-gray-400">Total Fees</div>
                                        <div>${pool.totalFees.toFixed(2)}</div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid grid-cols-2 gap-1">
                                        <a
                                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Pool
                                            <ExternalLink size={12} />
                                        </a>
                                        <a
                                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
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
                                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
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
                                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs py-1 px-1 rounded flex items-center justify-center gap-1"
                                            onClick={(e) => {
                                                setDepositPool(pool);
                                                handleDepositClick(e);
                                            }}
                                        >
                                            Deposit
                                            <PanelsTopLeft size={12} />
                                        </button>
                                    </div>
                                </div>

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