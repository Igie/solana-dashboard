import { TrendingUp } from "lucide-react";
import { SortArrow } from "./SortArrow";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DepositPopover } from "./Dammv2DepositPopover";
import { useState } from "react";
import { useTokenAccounts } from "../../contexts/TokenAccountsContext";
import type { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTransactionManager } from "../../contexts/TransactionManagerContext";
import type { TokenMetadataMap } from "../../tokenUtils";
import { getShortMint, PoolSortType, type PoolDetailedInfo } from "../../constants";

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

    const { publicKey } = useWallet();
    const { sendTxn } = useTransactionManager();
    const { refreshTokenAccounts } = useTokenAccounts();

    const [sortBy, setSortBy] = useState<PoolSortType>(PoolSortType.PoolBaseFee);
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

    const sortPositions = (pools: PoolDetailedInfo[], sortType: PoolSortType, ascending?: boolean) => {

        const p = pools.sort((x, y) => {
            let r = 0;
            if (ascending === null) {
                return (x.activationTime - y.activationTime);
            }
            switch (sortType) {

                case PoolSortType.PoolActivationTime:
                    r = (x.activationTime - y.activationTime);
                    break;

                case PoolSortType.PoolBaseFee:
                    r = (x.baseFeeBPS - y.baseFeeBPS);
                    break;

                case PoolSortType.PoolCurrentFee:
                    r = (x.totalFeeBPS - y.totalFeeBPS);
                    break;
            }

            if (!ascending)
                r = -r;
            return r;
        }
        )

        pools = p;
    }
    const handleSort = (sortType: PoolSortType, ascending?: boolean) => {
        setSortBy(sortType);
        setSortAscending(ascending);
        sortPositions(pools, sortType, ascending)
    };

    const handleDepositClick = async (e: React.MouseEvent) => {
        await refreshTokenAccounts();
        const rect = (e.target as HTMLElement).getBoundingClientRect();

        setPosition({ x: rect.left, y: rect.bottom + window.scrollY });
        setPopoverVisible(true);
    }
    return (
        <div>

            {pools.length > 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        DAMMv2 Pools {pools.length > 20 && 'Showing first 20 (total ' + pools.length + ')'}


                    </h3>

                    <div className="overflow-x-auto">
                        <div className="grid grid-cols-10 gap-4 px-4 py-2 text-sm font-medium text-gray-400 border-b border-gray-700">
                            <div className='col-span-2 grid grid-cols-3 justify-center'>
                                <div className='flex justify-center items-center'>Pool</div>
                                <div className='flex justify-center items-center'>Jup Trade</div>
                                <div className='flex justify-center items-center'>Deposit</div>
                            </div>
                            <div className='flex justify-start items-center'>Base Token</div>
                            <div className='flex justify-start items-center'>Quote Token</div>
                            <div className='flex justify-start items-center'>
                                <div>Activation</div>
                                {SortArrow(PoolSortType.PoolActivationTime, sortBy, sortAscending, handleSort)}
                            </div>
                            <div className='flex justify-start items-center'>Fee Mode</div>
                            <div className='flex justify-start items-center'>TVL</div>
                            <div className='flex justify-start items-center'>Scheduler</div>
                            <div className='flex justify-start items-center'>
                                <div className='flex justify-start items-center'>Base Fee</div>
                                {SortArrow<PoolSortType>(PoolSortType.PoolBaseFee, sortBy, sortAscending, handleSort)}
                            </div>
                            <div className='flex justify-start items-center'>
                                <div>Current Fee</div>
                                {SortArrow<PoolSortType>(PoolSortType.PoolCurrentFee, sortBy, sortAscending, handleSort)}
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
                        await sendTxn(x, [nft], {
                            notify: true,
                            onSuccess: () => {
                                setPopoverVisible(false);
                            }
                        })

                    }}
                />
            )}
                        {pools.slice(0, Math.min(20, pools.length)).map((pool, index) => (
                            <div
                                key={index}
                                className="grid grid-cols-10 gap-4 px-4 py-3 text-sm text-white border-b border-gray-800"
                            >
                                <div className='col-span-2 grid items grid-cols-3'>
                                    <div className="flex items-center justify-center">
                                        <a
                                            href={`https://app.meteora.ag/dammv2/${pool.poolInfo.publicKey.toBase58()}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-white text-sm font-medium"
                                        >
                                            Pool
                                        </a>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            onClick={() => {
                                                window.Jupiter.init({
                                                    formProps: {
                                                        initialInputMint: pool.poolInfo.account.tokenBMint.toBase58(),
                                                        initialOutputMint: pool.poolInfo.account.tokenAMint.toBase58(),
                                                        initialAmount: (0.01 * LAMPORTS_PER_SOL).toString(),

                                                    }
                                                });
                                            }}
                                        >
                                            Jup Trade
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            onClick={(e) => {
                                                setDepositPool(pool);
                                                handleDepositClick(e);
                                            }}
                                        >
                                            Deposit
                                        </button>
                                    </div>
                                </div>
                                <div className="font-mono grid items-end">
                                    {tokenMetadataMap[pool.poolInfo.account.tokenAMint.toBase58()]?.name || (pool.poolInfo.account.tokenAMint.toBase58().slice(0, 4) + '...')}
                                    <button className="bg-gray-600 hover:bg-gray-500 px-2 py-2 rounded-lg text-white font-medium flex items-center gap-1"
                                        onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenAMint.toBase58())}>
                                        {getShortMint(pool.poolInfo.account.tokenAMint)}
                                    </button>
                                </div>
                                <div className="font-mono grid items-end">
                                    {tokenMetadataMap[pool.poolInfo.account.tokenBMint.toBase58()]?.name || pool.poolInfo.account.tokenBMint.toBase58().slice(0, 4) + '...'}
                                    <button className="bg-gray-600 hover:bg-gray-500 px-2 py-2 rounded-lg text-white font-medium flex items-center gap-1"
                                        onClick={() => navigator.clipboard.writeText(pool.poolInfo.account.tokenBMint.toBase58())}>
                                        {getShortMint(pool.poolInfo.account.tokenBMint)}
                                    </button>
                                </div>
                                <div className="text-gray-300">

                                    {formatDuration((pool.activationTime))} ago
                                </div>
                                <div className="text-gray-300">
                                    {(pool.poolInfo.account.collectFeeMode === 0 ? "Both Tokens" :
                                        pool.poolInfo.account.collectFeeMode === 1 ? "Quote Token" : "Unknown")}
                                </div>
                                <div className="text-gray-300">
                                    ${
                                        pool.TVL.toFixed(2) || "Unknown"
                                    }
                                </div>

                                <div className="text-gray-300">
                                    {pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode == 0 ? "Linear" :
                                        pool.poolInfo.account.poolFees.baseFee.feeSchedulerMode == 1 ? "Exponential" : "Unknown"
                                    }
                                </div>
                                <div className="text-gray-300">
                                    {
                                        pool.baseFeeBPS / 100 || "Unknown"
                                    }%
                                </div>
                                <div className="text-gray-300">
                                    {
                                        pool.totalFeeBPS / 100 || "Unknown"
                                    }%
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