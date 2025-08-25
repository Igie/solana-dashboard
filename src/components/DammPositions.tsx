import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wallet, ExternalLink, Droplets, TrendingUp, ChevronDown, ChevronUp, Menu } from 'lucide-react'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
//import Decimal from 'decimal.js'
import { SortType, useDammUserPositions, type PoolPositionInfo } from '../contexts/DammUserPositionsContext'
//import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
//import { getQuote, getSwapTransactionVersioned } from '../JupSwapApi'
import { toast } from 'sonner'
import { BN } from '@coral-xyz/anchor'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { PublicKey } from '@solana/web3.js'
//import { txToast } from './Simple/TxToast'
import { copyToClipboard, getSchedulerType, renderFeeTokenImages } from '../constants'

const DammPositions: React.FC = () => {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  const { sendTxn } = useTransactionManager();
  const { updatePosition, removePosition } = useDammUserPositions()

  //const { tokenAccounts, refreshTokenAccounts } = useTokenAccounts();
  const { positions, totalLiquidityValue, loading, refreshPositions, sortPositionsBy, removeLiquidityAndSwapToQuote } = useDammUserPositions();
  const [selectedPositions, setSelectedPositions] = useState<Set<PoolPositionInfo>>(new Set());
  const [lastSelectedPosition, setLastSelectedPosition] = useState<PoolPositionInfo | null>(null);
  //const { refreshTokenAccounts } = useTokenAccounts();

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

  const handleClosePositionAndSwap = async (position: PoolPositionInfo) => {
    if (cpAmm.isLockedPosition(position.positionState)) {
      toast.error("Cannot close a locked position");
      return;
    }
    removeLiquidityAndSwapToQuote(position);
    // const txn = await cpAmm.removeAllLiquidityAndClosePosition({
    //   owner: publicKey!,
    //   position: position.positionAddress,
    //   positionNftAccount: position.positionNftAccount,
    //   positionState: position.positionState,
    //   poolState: position.poolState,
    //   tokenAAmountThreshold: new BN(position.tokenA.positionAmount * (10 ** position.tokenA.decimals)).muln(0.9),
    //   tokenBAmountThreshold: new BN(position.tokenB.positionAmount * (10 ** position.tokenB.decimals)).muln(0.9),
    //   vestings: [],
    //   currentPoint: new BN(0),
    // });

    // let closed = false;
    // try {
    //   await sendTxn(txn, undefined, {
    //     notify: true,
    //     onSuccess: () => {
    //       removePosition(position.positionAddress);
    //       if (expandedIndex)
    //         setExpandedIndex(null);

    //       closed = true;
    //     }
    //   })

    // } catch (e) {
    //   console.log(e);
    // }

    // if (closed) {
    //   const { tokenAccounts } = await refreshTokenAccounts();
    //   const tokenAAccount = tokenAccounts.find(x => x.mint == position.tokenA.mint);
    //   if (!tokenAAccount) {
    //     txToast.error("Could not find token account");
    //     return;
    //   }
    //   const quote = await getQuote({
    //     inputMint: position.tokenA.mint,
    //     outputMint: position.tokenB.mint,

    //     amount: new Decimal(tokenAAccount.amount).mul(Decimal.pow(10, tokenAAccount.decimals)).toNumber(),
    //     slippageBps: 1000,
    //   });

    //   const transaction = await getSwapTransactionVersioned(quote, publicKey!);

    //   await sendTxn(transaction, undefined, {
    //     notify: true,
    //     onError: () => {
    //       txToast.error("Swap failed");
    //     },
    //     onSuccess: async (x) => {
    //       txToast.success("Swap successful", x);
    //     }
    //   });
    // }
  }
  const poolContainsString = (pool: PoolPositionInfo, searchString: string): boolean => {
    const lowerSearch = searchString.toLowerCase();
    return pool.tokenA.name.toLowerCase().includes(lowerSearch) ||
      pool.tokenA.symbol.toLowerCase().includes(lowerSearch) ||
      pool.tokenA.mint === searchString ||
      pool.tokenB.name.toLowerCase().includes(lowerSearch) ||
      pool.tokenB.symbol.toLowerCase().includes(lowerSearch) ||
      pool.tokenB.mint === lowerSearch;
  }

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
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-75px)] space-y-2 px-2 md:px-0">
      {/* Pool Overview Stats */}
      <div className="grid grid-cols-2 gap-1">
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-blue-300">Liquidity</h3>
            <Droplets className="w-5 h-5 text-blue-400" />
          </div>
          <div className="sm:text-3xl font-bold text-white">
            ${totalLiquidityValue.toFixed(2)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-purple-300">Pools</h3>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <div className="sm:text-3xl font-bold text-white">
            {positions.length}
          </div>
        </div>
      </div>

      {/* Search Bar */}

      <input
        className="w-full bg-gray-800 border border-gray-600 px-2 py-1 rounded-lg text-white placeholder-gray-400 text-base"
        type="text"
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
        placeholder="Search by token mint, name or symbol..."
      />
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col items-stretch justify-start gap-2">
          <button
            onClick={() => {
              refreshPositions()
              setSelectedPositions(new Set())
            }}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors w-auto justify-center"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
          <button
            onClick={() => {
              setSelectedPositions(new Set([...positions]))
            }}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors w-auto justify-center"
          >
            Select All

          </button>
        </div>
        {/* Sort Menu */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-white w-auto justify-center"
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
                className={`block w-full text-left px-2 py-1 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PositionValue && sortAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PositionValue, true)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PositionValue && sortAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Unclaimed Fees</div>
              <button
                onClick={() => handleSort(SortType.PositionUnclaimedFee, false)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PositionUnclaimedFee && sortAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PositionUnclaimedFee, true)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PositionUnclaimedFee && sortAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Pool TVL</div>
              <button
                onClick={() => handleSort(SortType.PoolValue, false)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolValue && sortAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolValue, true)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolValue && sortAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>

              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Current Fee</div>
              <button
                onClick={() => handleSort(SortType.PoolCurrentFee, false)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolCurrentFee && sortAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolCurrentFee, true)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolCurrentFee && sortAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>
              <div className="text-xs text-gray-400 px-3 py-1 font-medium mt-2">Base Fee</div>
              <button
                onClick={() => handleSort(SortType.PoolBaseFee, false)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolBaseFee && sortAscending === false ? 'bg-gray-700' : ''
                  }`}
              >
                Highest to Lowest ↓
              </button>
              <button
                onClick={() => handleSort(SortType.PoolBaseFee, true)}
                className={`block w-full text-left px-3 py-2 text-white hover:bg-gray-700 rounded text-sm ${sortBy === SortType.PoolBaseFee && sortAscending === true ? 'bg-gray-700' : ''
                  }`}
              >
                Lowest to Highest ↑
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Total Fees Summary */}
      {positions.length > 0 && (
        <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-1">
          <div className="sm:flex-row items-start sm:items-center justify-between gap-1">
            <div className="text-green-300">
              <span className="text-sm font-semibold">
                Total Fees: ${positions.reduce((sum, pos) => sum + pos.positionUnclaimedFee, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                className="bg-purple-600 hover:bg-purple-500 px-4 py-1 rounded text-white flex-1 sm:flex-none"
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
                className="bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded text-white flex-1 sm:flex-none"
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

        <div className="flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          {/* Desktop Table Header - Sticky */}
          {(!loading) && (
            <div className="hidden md:block bg-gray-800 border-b border-gray-600 sticky top-0">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-medium text-gray-300 uppercase tracking-wider">
                <div className="col-span-1"></div>
                <div className="col-span-2">Pair</div>
                <div className="col-span-2">Your Liquidity</div>
                <div className="col-span-2">Fees</div>
                <div className="col-span-2">Claimable</div>
                <div className="col-span-2">Scheduler</div>
                <div className="col-span-1"></div>
              </div>
            </div>
          )}
          {/* Scrollable Content */}
          <div className="flex-grow overflow-y-auto">
            {positions.filter((x) => poolContainsString(x, searchString)).map((position, index) => (
              <div key={index}>
                {/* Desktop Table Row */}
                <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-700 hover:bg-gray-800/50 items-center">
                  {/* Checkbox */}
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      className="scale-125 accent-purple-600"
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
                  </div>

                  {/* Token Pair */}
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                          {position.tokenA.image ? (
                            <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-[10px]">
                              {position.tokenA.symbol.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                          {position.tokenB.image ? (
                            <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-[10px]">
                              {position.tokenB.symbol.slice(0, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm">
                          <button
                            onClick={() => copyToClipboard(position.tokenA.mint)}
                            className="hover:text-purple-400 transition-colors"
                            title="Copy mint address"
                          >
                            {position.tokenA.symbol}
                          </button>
                          <span className="text-gray-500">/</span>
                          <button
                            onClick={() => copyToClipboard(position.tokenB.mint)}
                            className="hover:text-purple-400 transition-colors"
                            title="Copy mint address"
                          >
                            {position.tokenB.symbol}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Your Liquidity */}
                  <div className="col-span-2">
                    <div className="text-white font-medium">${position.positionValue.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">
                      ({position.shareOfPoolPercentage.toFixed(2)}%)
                    </div>
                  </div>

                  {/* Current/Base Fees */}
                  <div className="col-span-2">
                    <div className="text-white text-sm">
                      {(position.poolCurrentFeeBPS / 100).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      Base: {(position.poolBaseFeeBPS / 100).toFixed(2)}%
                    </div>
                  </div>

                  {/* Claimable Fees */}
                  <div className="col-span-2">
                    {position.positionUnclaimedFee > 0 ? (
                      <div className="flex items-center gap-2">
                        {renderFeeTokenImages(position)}
                        <div>
                          <div className="text-green-400 font-medium text-sm">
                            ${position.positionUnclaimedFee.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm">-</div>
                    )}
                  </div>

                  {/* Scheduler */}
                  <div className="col-span-2">
                    <div className="text-white text-sm">
                      {getSchedulerType(position.poolState.poolFees.baseFee.feeSchedulerMode)}
                    </div>
                  </div>

                  {/* Expand Button */}
                  <div className="col-span-1">
                    <button
                      onClick={() => toggleRowExpand(index)}
                      className="p-1 rounded hover:bg-gray-700 transition-colors"
                    >
                      {expandedIndex == index ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="md:hidden border-b border-gray-700">
                  <div className="p-2">
                    {/* Header Row with Checkbox and Token Pair */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="scale-125 accent-purple-600"
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
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                              {position.tokenA.image ? (
                                <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
                                  {position.tokenA.symbol.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600">
                              {position.tokenB.image ? (
                                <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                                  {position.tokenB.symbol.slice(0, 2)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(position.tokenA.mint)}
                              className="text-white hover:text-purple-400 transition-colors font-medium"
                              title="Copy mint address"
                            >
                              {position.tokenA.symbol}
                            </button>
                            <span className="text-gray-500">/</span>
                            <button
                              onClick={() => copyToClipboard(position.tokenB.mint)}
                              className="text-white hover:text-purple-400 transition-colors font-medium"
                              title="Copy mint address"
                            >
                              {position.tokenB.symbol}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleRowExpand(index)}
                        className="p-2 rounded hover:bg-gray-700 transition-colors"
                      >
                        {expandedIndex == index ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>

                    {/* Mobile Info Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Your Liquidity</div>
                        <div className="text-white font-medium">${position.positionValue.toFixed(2)}</div>
                        <div className="text-xs text-gray-400">({position.shareOfPoolPercentage.toFixed(2)}%)</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Fees</div>
                        <div className="text-white text-sm">{(position.poolCurrentFeeBPS / 100).toFixed(2)}%</div>
                        <div className="text-xs text-gray-400">Base: {(position.poolBaseFeeBPS / 100).toFixed(2)}%</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Claimable</div>
                        {position.positionUnclaimedFee > 0 ? (
                          <div className="flex items-center gap-2">
                            {renderFeeTokenImages(position)}
                            <div className="text-green-400 font-medium text-sm">
                              ${position.positionUnclaimedFee.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm">-</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Scheduler</div>
                        <div className="text-white text-sm">
                          {getSchedulerType(position.poolState.poolFees.baseFee.feeSchedulerMode)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Panel (Same for both desktop and mobile) */}
                {expandedIndex == index && (
                  <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Pool Links */}
                      <div>
                        <h4 className="text-white font-medium mb-2 text-sm">Pool Analytics</h4>
                        <div className="space-y-2">
                          <a
                            href={`https://edge.meteora.ag/dammv2/${position.poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                          >
                            Meteora Pool <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://dexscreener.com/solana/${position.poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                          >
                            DexScreener <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://axiom.trade/meme/${position.poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                          >
                            Axiom Chart <ExternalLink className="w-3 h-3" />
                          </a>
                           <a
                            href={`https://www.dextools.io/app/en/solana/pair-explorer/${position.poolAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                          >
                            DEXTools Chart <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      

                      {/* Token Links */}
                      <div>
                        <h4 className="text-white font-medium mb-2 text-sm">Token Analytics</h4>
                        <div className="space-y-2">
                          <a
                            href={`https://gmgn.ai/sol/token/${position.tokenA.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {position.tokenA.symbol} on GMGN <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://gmgn.ai/sol/token/${position.tokenB.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {position.tokenB.symbol} on GMGN <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className='y-1' />
                          <a
                            href={`https://axiom.trade/t/${position.tokenA.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {position.tokenA.symbol} on AXIOM <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://axiom.trade/t/${position.tokenB.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                          >
                            {position.tokenB.symbol} on AXIOM <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      {/* Actions */}
                      <div>
                        <h4 className="text-white font-medium mb-2 text-sm">Actions</h4>
                        <div className="space-y-2">
                          {position.positionUnclaimedFee > 0 && (
                            <button className="w-full bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded"
                              onClick={() => handleClaimFees(position)}>
                              Claim Fees
                            </button>
                          )}
                          <button className="w-full bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2 rounded"
                            onClick={() => handleClosePosition(position)}>
                            Close Position
                          </button>

                          <button className="w-full bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-2 rounded"
                            onClick={() => handleClosePositionAndSwap(position)}>
                            Close and Swap Position
                          </button>
                        </div>
                      </div>
                    </div>
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

export default DammPositions