import { ExternalLink, PanelsTopLeft, TrendingUp } from "lucide-react";
import { SortArrow } from "./SortArrow";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DepositPopover } from "./Dammv2DepositPopover";
import { useEffect, useState } from "react";
import { useTokenAccounts } from "../../contexts/TokenAccountsContext";
import type { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { useTransactionManager } from "../../contexts/TransactionManagerContext";
import { GetTokenAccountMap, type TokenAccountMap, type TokenMetadataMap } from "../../tokenUtils";
import { getShortMint, PoolSortType, sortPositions, type PoolDetailedInfo } from "../../constants";
import { useWallet } from "@jup-ag/wallet-adapter";
import { getPoolPositionMap, useDammUserPositions, type PoolPositionInfoMap } from "../../contexts/DammUserPositionsContext";

interface Dammv2PoolListProps {
    cpAmm: CpAmm
    pools: PoolDetailedInfo[]
    tokenMetadataMap: TokenMetadataMap
}

const Dammv2PoolList: React.FC<Dammv2PoolListProps> = (
    {
        cpAmm,
        pools,
        tokenMetadataMap,
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

    function formatDuration(seconds: number | null): string {
        if (!seconds) return "0s"

        if (seconds < 0) return seconds.toString() + "s"
        const d = Math.floor(seconds / 86400)
        const h = Math.floor((seconds % 86400) / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = seconds % 60

        const parts = []
        if (d > 0) parts.push(`${d}d`)
        if (h > 0 || d > 0) parts.push(`${h}h`)
        if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
        if (d === 0 && h === 0 && m === 0) parts.push(`${s}s`)

        return parts.join(' ')
    }

    const handleSort = (sortType: PoolSortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        sortPositions(pools, sortType, ascending)
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

    return (
        <div>
            {pools.length > 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-3 md:p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        <span className="text-sm md:text-lg">
                            DAMMv2 Pools {pools.length > 60 && 'Showing first 60 (total ' + pools.length + ')'}
                        </span>
                    </h3>

                    {/* Desktop Table Header - Hidden on mobile */}
                    <div className="hidden lg:block overflow-x-auto">
                        <div className="grid grid-cols-10 gap-2 px-4 py-2 text-sm font-medium text-gray-400 border-b border-gray-700">
                            <div className='col-span-2 grid-cols-4 flex justify-center items-center'>Links</div>
                            <div className='col-span-3 grid grid-cols-4 justify-center gap-x-2'>
                                <div className='flex justify-center items-center'>Base Token</div>
                                <div className='flex justify-center items-center'>Quote Token</div>
                                <div className='flex justify-center items-center'>Fee Mode</div>
                                <div className='flex justify-center items-center'>Scheduler</div>
                            </div>
                            <div className='col-span-3 grid grid-cols-4 justify-center gap-x-2'>
                                <div className='flex justify-center items-center'>
                                    <div>Activation</div>
                                    {SortArrow(PoolSortType.PoolActivationTime, sortBy, sortAscending, handleSort)}
                                </div>
                                <div className='flex justify-center items-center'>TVL</div>
                                <div className='flex justify-center items-center'>
                                    <div className='flex justify-center items-center'>Base Fee</div>
                                    {SortArrow<PoolSortType>(PoolSortType.PoolBaseFee, sortBy, sortAscending, handleSort)}
                                </div>
                                <div className='flex justify-start items-center'>
                                    <div className='flex justify-center items-center'>Current Fee</div>
                                    {SortArrow<PoolSortType>(PoolSortType.PoolCurrentFee, sortBy, sortAscending, handleSort)}
                                </div>
                            </div>
                            <div className='col-span-2 grid grid-cols-3 justify-center gap-x-2'>
                                <div className='flex justify-center items-center'>
                                    <div>Token A Fees</div>
                                    {SortArrow<PoolSortType>(PoolSortType.PoolTokenAFees, sortBy, sortAscending, handleSort)}
                                </div>
                                <div className='flex justify-center items-center'>
                                    <div>Token B Fees</div>
                                    {SortArrow<PoolSortType>(PoolSortType.PoolTokenBFees, sortBy, sortAscending, handleSort)}
                                </div>
                                <div className='flex justify-center items-center'>
                                    <div>Total Fees</div>
                                    {SortArrow<PoolSortType>(PoolSortType.PoolTotalFees, sortBy, sortAscending, handleSort)}
                                </div>
                            </div>
                        </div>
                    </div>

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

                    <div className="space-y-4 lg:space-y-0">
                        {pools.slice(0, Math.min(60, pools.length)).map((pool, index) => (
                            <div
                                key={index}
                                className="lg:grid lg:grid-cols-10 lg:gap-2 lg:px-4 lg:py-3 lg:text-sm lg:border-b lg:border-gray-800 
                                         block bg-gray-800 lg:bg-transparent rounded-lg lg:rounded-none p-4 lg:p-0 space-y-3 lg:space-y-0 text-white"
                            >
                                {/* Mobile Card Layout */}
                                <div className="lg:hidden space-y-3">
                                    {/* Token Info */}
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1 w-full">
                                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                                <span className="text-xs text-gray-400 w-12">Base:</span>
                                                <span className="text-sm font-mono truncate min-w-0">
                                                    {(tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name && 
                                                      tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name.length > 15)
                                                        ? tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name.slice(0, 15) + '...'
                                                        : tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name || 
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
                                                    {(tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name && 
                                                      tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name.length > 15)
                                                        ? tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name.slice(0, 15) + '...'
                                                        : tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name || 
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
                                    <div className="grid grid-cols-2 gap-2 text-xs">
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
                                        <div className="text-center p-1 bg-gray-700 rounded">
                                            <div className="text-gray-400">Token A Fees</div>
                                            <div>${pool.tokenA.totalFees.toFixed(2)}</div>
                                        </div>
                                        <div className="text-center p-1 bg-gray-700 rounded">
                                            <div className="text-gray-400">Token B Fees</div>
                                            <div>${pool.tokenB.totalFees.toFixed(2)}</div>
                                        </div>
                                        <div className="text-center p-1 bg-gray-700 rounded">
                                            <div className="text-gray-400">Total Fees</div>
                                            <div>${pool.totalFees.toFixed(2)}</div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="grid grid-cols-2 gap-1">
                                            <a
                                                className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-2 px-2 rounded flex items-center justify-center gap-1"
                                                href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Pool
                                                <ExternalLink size={12} />
                                            </a>
                                            <a
                                                className="bg-purple-600 hover:bg-purple-500 text-white text-xs py-2 px-2 rounded flex items-center justify-center gap-1"
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
                                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs py-2 px-2 rounded flex items-center justify-center gap-1"
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
                                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs py-2 px-2 rounded flex items-center justify-center gap-1"
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

                                {/* Desktop Table Row - Hidden on mobile */}
                                <div className="hidden lg:contents">
                                    <div className='col-span-2 grid grid-cols-4 gap-x-2'>
                                        {/* Pool Link */}
                                        <div className="flex items-center justify-center">
                                            <a
                                                className="w-full h-full bg-purple-600 hover:bg-purple-500 text-white text-sm flex items-center justify-center gap-1"
                                                href={`https://edge.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                Pool
                                                <ExternalLink size={14} />
                                            </a>
                                        </div>

                                        {/* GMGN Link */}
                                        <div className="flex items-center justify-center">
                                            <a
                                                className="w-full h-full bg-purple-600 hover:bg-purple-500 text-white text-sm flex items-center justify-center gap-1"
                                                href={`https://gmgn.ai/sol/token/NQhHUcmQ_${pool.tokenA.mint}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                GMGN
                                                <ExternalLink size={14} />
                                            </a>
                                        </div>

                                        {/* Jup Trade Popup */}
                                        <div className="flex items-center justify-center">
                                            <button
                                                disabled={!connected}
                                                className="w-full h-full grid bg-blue-600 hover:bg-blue-700 rounded-md text-white text-sm items-center justify-center gap-1"
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
                                                    <span>Jup Trade</span>
                                                    <PanelsTopLeft size={14} />
                                                </div>
                                                {tokenAccountMap[pool.tokenA.mint] && (
                                                    <span>{tokenAccountMap[pool.tokenA.mint].amount.toFixed(2)}</span>
                                                )}
                                            </button>
                                        </div>

                                        {/* Deposit Popup */}
                                        <div className="flex items-center justify-center">
                                            <button
                                                disabled={!connected}
                                                className="w-full h-full grid bg-blue-600 hover:bg-blue-700 rounded-md text-white text-sm items-center justify-center gap-1"
                                                onClick={(e) => {
                                                    setDepositPool(pool);
                                                    handleDepositClick(e);
                                                }}
                                            >
                                                <div className="flex gap-1 items-center justify-center">
                                                    <span>Deposit</span>
                                                    <PanelsTopLeft size={14} />
                                                </div>
                                                {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()] && (
                                                    <span>
                                                        {userPoolPositionInfoMap[pool.poolInfo.publicKey.toBase58()].positionValue.toFixed(2) + "$"}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className='col-span-3 grid items grid-cols-4 gap-x-2'>
                                        <div className="font-mono grid items-center justify-center">
                                            <div className="truncate">
                                                {tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name || (pool.poolInfo.account.tokenAMint.toBase58().slice(0, 4) + '...')}
                                            </div>
                                            <button className="bg-gray-600 hover:bg-gray-500 px-1 py-0.5 rounded-md text-white text-sm justify-center"
                                                onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenAMint.toBase58())}>
                                                {getShortMint(pool.poolInfo.account.tokenAMint)}
                                            </button>
                                        </div>
                                        <div className="font-mono grid items-center justify-center">
                                            <div className="truncate">
                                                {tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name || pool.poolInfo.account.tokenBMint.toBase58().slice(0, 4) + '...'}
                                            </div>
                                            <button className="bg-gray-600 hover:bg-gray-500 px-1 py-0.5 rounded-md text-white text-sm justify-center"
                                                onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenBMint.toBase58())}>
                                                {getShortMint(pool.poolInfo.account.tokenBMint)}
                                            </button>
                                        </div>

                                        <div className="text-gray-300 grid items-center justify-center">
                                            {(pool.poolInfo.account.collectFeeMode === 0 ? "Both Tokens" :
                                                pool.poolInfo.account.collectFeeMode === 1 ? "Quote Token" : "Unknown")}
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode == 0 ? "Linear" :
                                                pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode == 1 ? "Exponential" : "Unknown"
                                            }
                                        </div>
                                    </div>

                                    <div className='col-span-3 grid items grid-cols-4 gap-x-2'>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {formatDuration((pool.activationTime))} ago
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            ${pool.TVL.toFixed(2) || "Unknown"}
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {pool.baseFeeBPS / 100 || "Unknown"}%
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {pool.totalFeeBPS / 100 || "Unknown"}%
                                        </div>
                                    </div>

                                    <div className='col-span-2 grid items grid-cols-3 gap-x-2'>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {"$" + pool.tokenA.totalFees.toFixed(2) || "Unknown"}
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {"$" + pool.tokenB.totalFees.toFixed(2) || "Unknown"}
                                        </div>
                                        <div className="text-gray-300 grid items-center justify-center">
                                            {"$" + pool.totalFees.toFixed(2) || "Unknown"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default Dammv2PoolList