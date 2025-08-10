import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wallet, ExternalLink, Droplets, TrendingUp, ChevronDown, ChevronUp, Menu } from 'lucide-react'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { SortType, useDammUserPositions, type PoolPositionInfo } from '../contexts/DammUserPositionsContext'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
import { getSwapTransaction } from '../JupSwapApi'
import { toast } from 'sonner'
import { BN } from '@coral-xyz/anchor'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { PublicKey } from '@solana/web3.js'

interface TwoMints {
    base: string,
    quote: string,
}

const DammPositions: React.FC = () => {
    const { connection } = useConnection()
    const { publicKey, connected } = useWallet()
    const { sendTxn } = useTransactionManager();
    const { updatePosition, removePosition } = useDammUserPositions()

    //const { tokenAccounts, refreshTokenAccounts } = useTokenAccounts();
    const { positions, totalLiquidityValue, loading, refreshPositions, sortPositionsBy } = useDammUserPositions();
    const [selectedPositions, setSelectedPositions] = useState<Set<PoolPositionInfo>>(new Set());
    const [lastSelectedPosition, setLastSelectedPosition] = useState<PoolPositionInfo | null>(null);
    const { tokenAccounts } = useTokenAccounts();

    const [mintToMintSwap, setMintToMintSwap] = useState<TwoMints[]>([])

    const [searchString, setSearchString] = useState<string>("")

    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const [sortBy, setSortBy] = useState<SortType>(SortType.PoolBaseFee);
    const [sortAscending, setSortAscending] = useState<boolean | undefined>(true);
    const [showSortMenu, setShowSortMenu] = useState(false);

    const popupRef = useRef<HTMLDivElement | null>(null)
    const cpAmm = new CpAmm(connection);

    const toggleRowExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    const handleClaimFees = async (position: PoolPositionInfo) => {
        if (position.positionUnclaimedFee <= 0) return;

        const txn = await cpAmm.claimPositionFee2({
            receiver: publicKey!,
            owner: publicKey!,
            feePayer: publicKey!,
            pool: position.poolAddress,
            position: position.positionAddress,
            positionNftAccount: position.positionNftAccount,
            tokenAMint: position.poolState.tokenAMint,
            tokenBMint: position.poolState.tokenBMint,
            tokenAProgram: new PublicKey(position.tokenA.tokenProgram),
            tokenBProgram: new PublicKey(position.tokenB.tokenProgram),
            tokenAVault: position.poolState.tokenAVault,
            tokenBVault: position.poolState.tokenBVault,
        })

        try {
            await sendTxn(txn, undefined, {
                notify: true,
                onSuccess: () => {
                    updatePosition(position.positionAddress);
                }
            })

        } catch (e) {
            console.log(e);
        }
    }

    const handleClosePosition = async (position: PoolPositionInfo) => {
        if (cpAmm.isLockedPosition(position.positionState)) {
            toast.error("Cannot close a locked position");
            return;
        }

        const txn = await cpAmm.removeAllLiquidityAndClosePosition({
            owner: publicKey!,
            position: position.positionAddress,
            positionNftAccount: position.positionNftAccount,
            positionState: position.positionState,
            poolState: position.poolState,
            tokenAAmountThreshold: new BN(0),
            tokenBAmountThreshold: new BN(0),
            vestings: [],
            currentPoint: new BN(0),
        });

        try {
            await sendTxn(txn, undefined, {
                notify: true,
                onSuccess: () => {
                    removePosition(position.positionAddress);
                    if (expandedIndex)
                        setExpandedIndex(null);
                }
            })

        } catch (e) {
            console.log(e);
        }
    };

    const poolContainsString = (pool: PoolPositionInfo, searchString: string): boolean => {
        const lowerSearch = searchString.toLowerCase();
        return pool.tokenA.name.toLowerCase().includes(lowerSearch) ||
            pool.tokenA.symbol.toLowerCase().includes(lowerSearch) ||
            pool.tokenA.mint===searchString ||
            pool.tokenB.name.toLowerCase().includes(lowerSearch) ||
            pool.tokenB.symbol.toLowerCase().includes(lowerSearch) ||
            pool.tokenB.mint === lowerSearch;
    }

    useEffect(() => {
        if (!mintToMintSwap || mintToMintSwap.length === 0 || connection === null || publicKey === null) return;

        const copy = [...mintToMintSwap]
        const pair = copy.pop();
        if (!pair) return;
        const tokenAccount = tokenAccounts.find(x => x.mint === pair?.base);
        if (!tokenAccount) return;

        const t = getSwapTransaction({
            inputMint: pair?.base,
            outputMint: pair?.quote,
            amount: tokenAccount.amount * (10 ** tokenAccount.decimals),
            slippageBps: 1500
        },
            connection, publicKey!);

        t.then(async (x) => {
            if (!x) return;
            await sendTxn(x, undefined,
                {
                    notify: true,
                    onSuccess: async () => {
                        setMintToMintSwap(copy);
                    }
                }
            )
        })

    }, [mintToMintSwap])

    useEffect(() => {
        refreshPositions();
        setSelectedPositions(new Set());
    }, [connection, publicKey])

    // Close popup and sort menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setShowSortMenu(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleSort = (sortType: SortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        sortPositionsBy(sortType, ascending);
        setShowSortMenu(false);
    };

    if (!connected) {
        return (
            <div className="text-center py-12 px-4">
                <Wallet className="w-16 h-16 mx-auto mb-6 text-gray-400" />
                <h2 className="text-2xl font-bold mb-4 text-gray-300">Connect Your Wallet</h2>
                <p className="text-gray-400 mb-6 px-4">Connect your Solana wallet to view your DAMMv2 pool positions</p>
                <UnifiedWalletButton buttonClassName="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !font-medium !px-8 !py-3" />
            </div>
        )
    }

    return (
        <div className="space-y-4 px-4 md:px-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button
                    onClick={() => {
                        refreshPositions()
                        setSelectedPositions(new Set())
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors w-full sm:w-auto justify-center sm:justify-start"
                >
                    {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Refresh
                </button>

                {/* Sort Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white w-full sm:w-auto justify-center sm:justify-start"
                    >
                        <Menu className="w-4 h-4" />
                        Sort
                        {showSortMenu ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showSortMenu && (
                        <div className="absolute right-0 top-12 bg-gray-800 border border-gray-600 rounded-lg p-2 z-10 min-w-56 shadow-lg">
                            <div className="text-xs text-gray-400 px-3 py-1 font-medium">Position Value</div>
                            <button
                                onClick={() => handleSort(SortType.PositionValue, false)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PositionValue && sortAscending === false ? 'bg-gray-700' : ''
                                }`}
                            >
                                Highest to Lowest ↓
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PositionValue, true)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PositionValue && sortAscending === true ? 'bg-gray-700' : ''
                                }`}
                            >
                                Lowest to Highest ↑
                            </button>
                            
                            <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Unclaimed Fees</div>
                            <button
                                onClick={() => handleSort(SortType.PositionUnclaimedFee, false)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PositionUnclaimedFee && sortAscending === false ? 'bg-gray-700' : ''
                                }`}
                            >
                                Highest to Lowest ↓
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PositionUnclaimedFee, true)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PositionUnclaimedFee && sortAscending === true ? 'bg-gray-700' : ''
                                }`}
                            >
                                Lowest to Highest ↑
                            </button>

                            <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Pool TVL</div>
                            <button
                                onClick={() => handleSort(SortType.PoolValue, false)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolValue && sortAscending === false ? 'bg-gray-700' : ''
                                }`}
                            >
                                Highest to Lowest ↓
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PoolValue, true)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolValue && sortAscending === true ? 'bg-gray-700' : ''
                                }`}
                            >
                                Lowest to Highest ↑
                            </button>

                            <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Pool Fees</div>
                            <button
                                onClick={() => handleSort(SortType.PoolCurrentFee, false)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolCurrentFee && sortAscending === false ? 'bg-gray-700' : ''
                                }`}
                            >
                                Current Fee ↓
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PoolCurrentFee, true)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolCurrentFee && sortAscending === true ? 'bg-gray-700' : ''
                                }`}
                            >
                                Current Fee ↑
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PoolBaseFee, false)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolBaseFee && sortAscending === false ? 'bg-gray-700' : ''
                                }`}
                            >
                                Base Fee ↓
                            </button>
                            <button
                                onClick={() => handleSort(SortType.PoolBaseFee, true)}
                                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${
                                    sortBy === SortType.PoolBaseFee && sortAscending === true ? 'bg-gray-700' : ''
                                }`}
                            >
                                Base Fee ↑
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Pool Overview Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-blue-300">Total Liquidity</h3>
                        <Droplets className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-white">
                        ${totalLiquidityValue.toFixed(2)}
                    </div>
                    <div className="text-sm text-blue-300 mt-2">
                        USD value of all positions
                    </div>
                </div>

                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-purple-300">Active Pools</h3>
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-white">
                        {positions.length}
                    </div>
                    <div className="text-sm text-purple-300 mt-2">
                        Pools with liquidity
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <input
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 rounded-lg text-white placeholder-gray-400 text-base"
                    type="text"
                    value={searchString}
                    onChange={(e) => setSearchString(e.target.value)}
                    placeholder="Search by token mint, name or symbol..."
                />
            </div>

            {/* Total Fees Summary */}
            {positions.length > 0 && (
                <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="text-green-300">
                            <span className="text-lg font-semibold">
                                Total Fees: ${positions.reduce((sum, pos) => sum + pos.positionUnclaimedFee, 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button
                                className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded text-white flex-1 sm:flex-none"
                                onClick={async () => {
                                    const selectedPositionsTemp = [...selectedPositions];
                                    for (const pos of selectedPositionsTemp) {
                                        await handleClosePosition(pos);
                                    }
                                    setSelectedPositions(new Set());
                                    await refreshPositions();
                                }}
                            >
                                Close All ({selectedPositions.size})
                            </button>
                            <button
                                className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-white flex-1 sm:flex-none"
                                onClick={async () => {
                                    const selectedPositionsTemp = [...selectedPositions];
                                    for (const pos of selectedPositionsTemp) {
                                        await handleClaimFees(pos);
                                    }
                                    setSelectedPositions(new Set());
                                }}
                            >
                                Claim Fees ({selectedPositions.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="p-8 text-center">
                    <RefreshCw className="w-8 h-8 mx-auto mb-4 text-purple-400 animate-spin" />
                    <p className="text-gray-400">Loading pool positions...</p>
                </div>
            )}

            {(positions.length === 0 && !loading) ? (
                <div className="p-8 text-center">
                    <Droplets className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">No Pool Positions Found</h3>
                    <p className="text-gray-500 px-4">
                        You don't have any active liquidity positions in DAMMv2 pools
                    </p>
                </div>
            ) : (
                /* Mobile-friendly position cards */
                <div className="space-y-1">
                    {positions.map((position, index) => ((searchString === "" || poolContainsString(position, searchString)) && (
                        <div key={index} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                            {/* Position Header */}
                            <div className="p-2 border-b border-gray-700">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-3">
                                        <input
                                            className="scale-125 accent-purple-600"
                                            type="checkbox"
                                            checked={selectedPositions.has(position)}
                                            onChange={(e) => {
                                                if (lastSelectedPosition !== null && (e.nativeEvent as MouseEvent).shiftKey) {
                                                    const index1 = positions.indexOf(position);
                                                    const index2 = positions.indexOf(lastSelectedPosition);
                                                    const addedRange = positions.slice(Math.min(index1, index2), Math.max(index1, index2) + 1);
                                                    setSelectedPositions(new Set([...selectedPositions, ...addedRange]));
                                                    setLastSelectedPosition(position);
                                                    return;
                                                }
                                                setLastSelectedPosition(position);
                                                if (e.target.checked) {
                                                    setSelectedPositions(new Set(selectedPositions.add(position)));
                                                }
                                                if (!e.target.checked) {
                                                    setSelectedPositions(new Set<PoolPositionInfo>(Array.from(selectedPositions).filter(x => x !== position)));
                                                }
                                            }}
                                        />
                                        
                                        {/* Token Pair */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center -space-x-1">
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border-2 border-gray-900">
                                                    {position.tokenA.image ? (
                                                        <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
                                                            {position.tokenA.symbol.slice(0, 2)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border-2 border-gray-900">
                                                    {position.tokenB.image ? (
                                                        <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                                                            {position.tokenB.symbol.slice(0, 2)}
                                                        </div>
                                                    )}
                                                    
                                                </div>
                                            </div>
                                            <div>
                                                
                                                <div className="text-white font-semibold">{position.tokenA.symbol}/{position.tokenB.symbol}</div>
                                                <div className="text-xs text-gray-400">
                                                    Share: {position.shareOfPoolPercentage.toFixed(2)}%
                                                </div>
                                            </div>
                                            <button 
                                            onClick={() => window.open(`https://edge.meteora.ag/dammv2/${position.poolAddress}`, '_blank')}
                                            className="text-purple-400 hover:text-purple-300 mt-1"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => toggleRowExpand(index)}
                                        className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"
                                    >
                                        {expandedIndex === index ? 
                                            <ChevronUp className="w-4 h-4 text-white" /> : 
                                            <ChevronDown className="w-4 h-4 text-white" />
                                        }
                                    </button>
                                </div>

                                {/* Key Metrics Row */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-xs text-gray-400 mt-1">Your Liquidity</div>
                                        <div className="text-lg font-bold text-white">${position.positionValue.toFixed(2)}</div>
                                        <div className="text-xs text-gray-400">
                                            {position.tokenA.positionAmount.toFixed(2)} {position.tokenA.symbol}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {position.tokenB.positionAmount.toFixed(2)} {position.tokenB.symbol}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-400 mt-1">Pool TVL</div>
                                        <div className="text-lg font-bold text-white">${position.poolValue.toFixed(2)}</div>
                                        <div className="text-xs text-gray-400">
                                            Fee: {(position.poolCurrentFeeBPS / 100).toFixed(2)}%
                                        </div>
                                        
                                    </div>
                                </div>

                                {/* Fees Section */}
                                {position.positionUnclaimedFee > 0 && (
                                    <div className="mt-1 p-1 bg-green-900/20 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-green-300 font-semibold">
                                                    Unclaimed: ${position.positionUnclaimedFee.toFixed(2)}
                                                </div>
                                                <div className="text-xs text-green-400">
                                                    {position.tokenA.unclaimedFee.toFixed(2)} {position.tokenA.symbol} + {position.tokenB.unclaimedFee.toFixed(2)} {position.tokenB.symbol}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleClaimFees(position)}
                                                className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm font-medium"
                                            >
                                                Claim
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Expandable Details */}
                            {expandedIndex === index && (
                                <div className="p-4 bg-gray-800">
                                    {/* Fee Model Details */}
                                    <div className="mb-4">
                                        <h4 className="text-white font-medium mb-2">Fee Model</h4>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="bg-gray-700 p-2 rounded">
                                                <div className="text-gray-400">Current Fee</div>
                                                <div className="text-white">{(position.poolCurrentFeeBPS / 100).toFixed(2)}%</div>
                                            </div>
                                            <div className="bg-gray-700 p-2 rounded">
                                                <div className="text-gray-400">Base Fee</div>
                                                <div className="text-white">{(position.poolBaseFeeBPS / 100).toFixed(2)}%</div>
                                            </div>
                                            <div className="bg-gray-700 p-2 rounded">
                                                <div className="text-gray-400">Scheduler</div>
                                                <div className="text-white text-xs">
                                                    {position.poolState.poolFees.baseFee.feeSchedulerMode === 0 ? "Linear" :
                                                        position.poolState.poolFees.baseFee.feeSchedulerMode === 1 ? "Exponential" : "Unknown"}
                                                </div>
                                            </div>
                                            <div className="bg-gray-700 p-2 rounded">
                                                <div className="text-gray-400">Fee Token</div>
                                                <div className="flex items-start justify-start gap-1">
                                                    {position.poolState.collectFeeMode === 0 ? (
                                                        <>
                                                            <img src={position.tokenA.image} alt="Token A" className="w-4 h-4 rounded-full" />
                                                            <img src={position.tokenB.image} alt="Token B" className="w-4 h-4 rounded-full" />
                                                        </>
                                                    ) : position.poolState.collectFeeMode === 1 ? (
                                                        <img src={position.tokenB.image} alt="Quote Token" className="w-4 h-4 rounded-full" />
                                                    ) : (
                                                        "Unknown"
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart - Mobile optimized */}
                                    <div className="mb-4">
                                        <h4 className="text-white font-medium mb-2">Price Chart</h4>
                                        <div className="w-full h-[300px] rounded-xl overflow-hidden">
                                            <iframe
                                                src={`https://www.gmgn.cc/kline/sol/${position.tokenA.mint}`}
                                                width="100%"
                                                height="100%"
                                                frameBorder="0"
                                                allowFullScreen
                                            ></iframe>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => handleClosePosition(position)}
                                            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-3 rounded-lg"
                                        >
                                            Close Position
                                        </button>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(position.tokenA.mint);
                                                    toast.info(`${position.tokenA.symbol} mint copied`);
                                                }}
                                                className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded-lg"
                                            >
                                                Copy {position.tokenA.symbol} Mint
                                            </button>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(position.tokenB.mint);
                                                    toast.info(`${position.tokenB.symbol} mint copied`);
                                                }}
                                                className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded-lg"
                                            >
                                                Copy {position.tokenB.symbol} Mint
                                            </button>
                                        </div>
                                        
                                        <button
                                            onClick={() => {
                                                window.open(`https://solscan.io/account/${position.positionAddress.toBase58()}`, '_blank');
                                            }}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
                                        >
                                            View on Solscan
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )))}
                </div>
            )}
        </div>
    )
}

export default DammPositions