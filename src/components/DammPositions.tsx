import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Wallet, ExternalLink, Droplets, TrendingUp } from 'lucide-react'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { SortType, useDammUserPositions, type PoolPositionInfo } from '../contexts/DammUserPositionsContext'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { useTransactionManager } from '../contexts/TransactionManagerContext'

import { getSwapTransaction } from '../JupSwapApi'
import { SortArrow } from './Simple/SortArrow'
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


    const [popupIndex, setPopupIndex] = useState<number | null>(null)

    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const [sortBy, setSortBy] = useState<SortType>(SortType.PoolBaseFee);
    const [sortAscending, setSortAscending] = useState<boolean | undefined>(true);

    const popupRef = useRef<HTMLDivElement | null>(null)
    const cpAmm = new CpAmm(connection);

    const togglePopup = (index: number) => {
        setPopupIndex(popupIndex === index ? null : index);
    }

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
            sendTxn(txn, undefined, {
                notify: true,
                onSuccess: () => {
                    updatePosition(position.positionAddress);
                }
            })

        } catch (e) {
            console.log(e);
        }
    }

    // const handleClaimAllFees = async () => {
    //     const txnSignerPairs: TxnSignersPair[] = [];

    //     for (const position of positions) {
    //         if (position.positionUnclaimedFee > 0) {
    //             const txn = await cpAmm.claimPositionFee2({
    //                 receiver: publicKey!,

    //                 owner: publicKey!,
    //                 feePayer: publicKey!,
    //                 pool: position.poolAddress,
    //                 position: position.positionAddress,
    //                 positionNftAccount: position.positionNftAccount,
    //                 tokenAMint: position.poolState.tokenAMint,
    //                 tokenBMint: position.poolState.tokenBMint,
    //                 tokenAProgram: new PublicKey(position.tokenA.tokenProgram),
    //                 tokenBProgram: new PublicKey(position.tokenA.tokenProgram),
    //                 tokenAVault: position.poolState.tokenAVault,
    //                 tokenBVault: position.poolState.tokenBVault,
    //             })

    //             txnSignerPairs.push({
    //                 tx: txn
    //             })
    //         }
    //     }
    //     if (txnSignerPairs.length == 0) return;
    //     try {
    //         sendMultiTxn(txnSignerPairs, {
    //             notify: true,
    //             onSuccess: async () => {
    //                 await refreshPositions();
    //             }
    //         })

    //     } catch (e) {
    //         console.log(e);
    //     }
    // }

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
            sendTxn(txn, undefined, {
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

        t.then((x) => {
            if (!x) return;
            sendTxn(x, undefined,
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

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setPopupIndex(null)
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
        sortPositionsBy(sortType, ascending)
    };

    if (!connected) {
        return (
            <div className="text-center py-12">
                <Wallet className="w-16 h-16 mx-auto mb-6 text-gray-400" />
                <h2 className="text-2xl font-bold mb-4 text-gray-300">Connect Your Wallet</h2>
                <p className="text-gray-400 mb-6">Connect your Solana wallet to view your DAMMv2 pool positions</p>
                <UnifiedWalletButton buttonClassName="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !font-medium !px-8 !py-3" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => {
                        refreshPositions()
                        setSelectedPositions(new Set())
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors"
                >
                    {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Refresh
                </button>
            </div>

            {/* Pool Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-blue-300">Total Liquidity</h3>
                        <Droplets className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-3xl font-bold text-white">
                        ${totalLiquidityValue.toFixed(2)}
                    </div>
                    <div className="text-sm text-blue-300 mt-2">
                        USD value of all positions
                    </div>
                </div>

                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-purple-300">Active Pools</h3>
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-3xl font-bold text-white">
                        {positions.length}
                    </div>
                    <div className="text-sm text-purple-300 mt-2">
                        Pools with liquidity
                    </div>
                </div>
            </div>

            {/* Pool Positions */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl">
                <div className="p-6 border-b border-gray-700">


                    {/* Column Headers */}
                    <div className="grid grid-cols-12 gap-4 py-3 text-sm font-medium text-gray-300">

                        <div className="col-span-3">Pool</div>
                        <div className="col-span-3 flex flex-col">
                            <div className='grid grid-cols-3 grid-rows-1'>
                                <span className='col-span-4  flex justify-start'>Fee Model</span>
                                <div className="col-span-1 flex items-center">
                                    <span className="text-xs font-normal text-gray-500">Current Fee</span>
                                    {SortArrow<SortType>(SortType.PoolCurrentFee, sortBy, sortAscending, handleSort)}
                                </div>
                                <div className="col-span-1 flex items-center">
                                    <span className="text-xs font-normal text-gray-500">Base Fee</span>
                                    {SortArrow<SortType>(SortType.PoolBaseFee, sortBy, sortAscending, handleSort)}
                                </div>
                                <span className="col-span-1 text-xs font-normal text-gray-500">Scheduler</span>
                                <span className="col-span-1 text-xs font-normal text-gray-500">Token</span>
                            </div>

                        </div>
                        <div className='col-span-4 grid grid-rows-2 grid-cols-8 gap-1 h-full'>
                            <div className="col-span-2 flex items-center">
                                <div>Your Liquidity</div>
                                {SortArrow<SortType>(SortType.PositionValue, sortBy, sortAscending, handleSort)}
                            </div>
                            <div className="col-span-2 col-start-1 row-start-2 flex items-center">
                                <div className='justify-self-start flex items-center gap-1 px-2 py-1 bg-green-900 rounded text-xs font-medium text-white transition-colors"'
                                    //onClick={handleClaimAllFees}
                                >
                                    Total Fees ${positions.reduce((sum, pos) => sum + pos.positionUnclaimedFee, 0).toFixed(2)}
                                </div>

                                {SortArrow<SortType>(SortType.PositionUnclaimedFee, sortBy, sortAscending, handleSort)}
                            </div>
                        </div>

                        <div className="col-span-2 flex items-center justify-end">
                            <div className="text-right">TVL</div>
                            {SortArrow<SortType>(SortType.PoolValue, sortBy, sortAscending, handleSort)}
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="p-8 text-center">
                        <RefreshCw className="w-8 h-8 mx-auto mb-4 text-purple-400 animate-spin" />
                        <p className="text-gray-400">Loading pool positions...</p>
                    </div>
                )}  {(positions.length === 0 && !loading) ? (
                    <div className="p-8 text-center">
                        <Droplets className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-300 mb-2">No Pool Positions Found</h3>
                        <p className="text-gray-500">
                            You don't have any active liquidity positions in DAMMv2 pools
                        </p>
                    </div>
                ) : (


                    <div className="divide-y divide-gray-700">

                        <div className="flex items-center justify-between p-4 bg-gray-800 border border-purple-700 rounded-xl mt-4">
                            <div className="text-purple-300">
                                {selectedPositions.size} pool{selectedPositions.size > 1 ? 's' : ''} selected
                            </div>
                            <div className="flex gap-2">
                                {/* <button
                                        className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded text-white"
                                     onClick={async () => 
                                     {
                                        for (const pos of selectedPositions)
                                        {
                                            await handleClosePositionAndSwapToQuote(pos);
                                        }
                                            await refreshPositions();
                                            setSelectedPositions(new Set());

                                     }
                                     }
                                    >
                                        Close All and Swap to Quote
                                    </button> */}
                                <button
                                    className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded text-white"
                                    onClick={async () => {
                                        const selectedPositionsTemp = [...selectedPositions];
                                        for (const pos of selectedPositionsTemp) {
                                            await handleClosePosition(pos);
                                        }
                                        setSelectedPositions(new Set());
                                    }}
                                >
                                    Close All
                                </button>
                                <button
                                    className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-white"
                                    onClick={async () => {
                                        const selectedPositionsTemp = [...selectedPositions];
                                        for (const pos of selectedPositionsTemp) {
                                            await handleClaimFees(pos);
                                        }
                                        setSelectedPositions(new Set());
                                    }}
                                >
                                    Claim Fees
                                </button>
                            </div>
                        </div>

                        {positions.map((position, index) => (
                            <div key={index} className="px-6 hover:bg-gray-800/50 transition-colors">
                                <div className="grid grid-cols-12 gap-4 items-center min-h-[96px]">
                                    <div className="col-span-3 flex items-center gap-4">
                                        <input
                                            className="scale-150 accent-purple-600"
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
                                                    setSelectedPositions(new Set<PoolPositionInfo>(Array.from(selectedPositions).filter(x => {
                                                        return x !== position
                                                    }
                                                    )));
                                                }
                                            }}
                                        />
                                        {/* Expand/Collapse Arrow */}
                                        <div className="flex justify-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleRowExpand(index);
                                                }}
                                                className={`w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all shadow-md`}
                                                title={expandedIndex === index ? 'Collapse Details' : 'Expand Details'}
                                            >
                                                <svg
                                                    className={`w-4 h-4 text-white transform transition-transform duration-300 ${expandedIndex === index ? 'rotate-180' : ''
                                                        }`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                        {/* Token A */}
                                        <div className="flex items-center -space-x-2 relative">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 border-2 border-gray-900" onClick={() => togglePopup(index)}>
                                                {position.tokenA.image ? (
                                                    <img src={position.tokenA.image} alt={position.tokenA.symbol} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
                                                        {position.tokenA.symbol.slice(0, 2)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Token B */}
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 border-2 border-gray-900">
                                            {position.tokenB.image ? (
                                                <img src={position.tokenB.image} alt={position.tokenB.symbol} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs">
                                                    {position.tokenB.symbol.slice(0, 2)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Pair Info */}
                                        <div className="flex flex-col justify-center">
                                            <div className="text-white font-semibold text-lg">{position.tokenA.symbol}/{position.tokenB.symbol}</div>
                                            <button onClick={() => window.open(`https://edge.meteora.ag/dammv2/${position.poolAddress}`, '_blank')} className="text-purple-400 hover:text-purple-300">
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                            <div className="text-sm text-gray-400 flex items-center gap-1">
                                                <span>Pool Share: {position.shareOfPoolPercentage.toFixed(2)}%</span>

                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-3 grid grid-cols-4 items-center gap-2 text-sm text-white">
                                        <div className="bg-gray-800 px-2 py-2 rounded-md text-xs text-gray-300 text-center">
                                            {(position.poolCurrentFeeBPS / 100).toFixed(2)}%
                                        </div>
                                        <div className="bg-gray-800 px-2 py-2 rounded-md text-xs text-gray-300 text-center">
                                            {(position.poolBaseFeeBPS / 100).toFixed(2)}%
                                        </div>
                                        <div className="bg-gray-800 px-2 py-2 rounded-md text-xs text-gray-300 text-center">
                                            {position.poolState.poolFees.baseFee.feeSchedulerMode === 0 ? "Linear" :
                                                position.poolState.poolFees.baseFee.feeSchedulerMode === 1 ? "Exponential" : "Unknown"}
                                        </div>
                                        <div className="bg-gray-800 px-2 py-2 rounded-md text-xs text-gray-300 flex items-center justify-center gap-1">
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
                                    {/* User Liquidity (col-span-4) */}
                                    <div className="col-span-4">
                                        <div className="grid grid-rows-2 grid-cols-8 gap-1 h-full">
                                            <div className="col-span-2 text-lg font-bold text-white">
                                                ${position.positionValue.toFixed(2)}
                                            </div>
                                            <div className="col-span-3 text-sm text-gray-400">
                                                {position.tokenA.positionAmount.toFixed(2)} {position.tokenA.symbol}
                                            </div>
                                            <div className="col-span-3 text-sm text-gray-400">
                                                {position.tokenB.positionAmount.toFixed(2)} {position.tokenB.symbol}
                                            </div>

                                            <div className='col-span-3 col-start-3 row-start-2 text-sm text-green-700'>{position.tokenA.unclaimedFee.toFixed(2)} {position.tokenA.symbol}</div>
                                            <div className='col-span-3 row-start-2 text-sm text-green-700'>{position.tokenB.unclaimedFee.toFixed(2)} {position.tokenB.symbol}</div>

                                            {position.positionUnclaimedFee > 0 && (
                                                <button
                                                    onClick={() => handleClaimFees(position)}
                                                    className="col-span-2 col-start-1 row-start-2 justify-self-start flex items-center gap-1 px-2 py-1 bg-green-900 hover:bg-green-700 rounded text-xs font-medium text-white transition-colors"
                                                >
                                                    Claim ${position.positionUnclaimedFee.toFixed(2)}
                                                </button>
                                            )}

                                        </div>
                                    </div>

                                    {/* Pool Value (col-span-2) */}
                                    <div className="col-span-2 flex flex-col justify-center items-end h-full text-right">
                                        <div className="text-lg font-bold text-white">${position.poolValue.toFixed(2)}</div>
                                        <div className="text-sm text-gray-400">
                                            {position.tokenA.poolAmount.toFixed(2)} {position.tokenA.symbol} + {position.tokenB.poolAmount.toFixed(2)} {position.tokenB.symbol}
                                        </div>
                                    </div>
                                </div>

                                {/* Expandable section (animated) */}
                                {expandedIndex === index && (
                                    <div className="p-4 mt-4 bg-gray-800 rounded-xl">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            {/* Chart iframe */}
                                            <div className="w-full md:w-3/4 h-[400px]">
                                                <iframe
                                                    src={`https://www.gmgn.cc/kline/sol/${position.tokenA.mint}`}
                                                    width="100%"
                                                    height="100%"
                                                    frameBorder="0"
                                                    className="rounded-xl"
                                                    allowFullScreen
                                                ></iframe>
                                            </div>

                                            {/* Actions */}
                                            <div className="w-full md:w-1/4 flex flex-col justify-start gap-3">
                                                <button
                                                    onClick={() => {
                                                        handleClosePosition(position);
                                                    }}
                                                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg"
                                                >
                                                    Close Position
                                                </button>
                                                {/* <button
                                                    onClick={() => {
                                                        handleClosePositionAndSwapToQuote(position);
                                                    }}
                                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                                                >
                                                    Close Position and Swap
                                                </button> */}

                                                {/* <button
                                                    onClick={() => {
                                                        // TODO: Add add liquidity logic
                                                    }}
                                                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg"
                                                >
                                                    Add Liquidity
                                                </button> */}

                                                <button
                                                    onClick={() => {
                                                        window.open(`https://solscan.io/account/${position.positionAddress.toBase58()}`, '_blank');
                                                    }}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
                                                >
                                                    View on Solscan
                                                </button>

                                                {/* Copy Token A Mint */}
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(position.tokenA.mint);
                                                        toast.info(`${position.tokenA.symbol} mint copied`);
                                                    }}
                                                    className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg"
                                                >
                                                    Copy {position.tokenA.symbol} Mint
                                                </button>

                                                {/* Copy Token B Mint */}
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(position.tokenB.mint);
                                                        toast.info(`${position.tokenB.symbol} mint copied`);
                                                    }}
                                                    className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg"
                                                >
                                                    Copy {position.tokenB.symbol} Mint
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                    </div>
                )}
            </div>
        </div>
    )
}
export default DammPositions