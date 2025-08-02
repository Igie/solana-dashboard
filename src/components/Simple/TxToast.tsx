import { toast } from 'sonner';

const SOLANA_EXPLORER = "https://solscan.io/tx/";

export const txToast = {
    loading: (msg: string, id = "tx") => {
        toast.loading(msg, {
            id,
            description: "Waiting for confirmation...",
        })
    },

    success: (msg: string, sig: string, id = "tx") => {
        toast.success(msg, {
            id,
            description: (
                <a
                    href={`${SOLANA_EXPLORER}${sig}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                >
                    View on Solscan ↗
                </a>
            ),
        })
    },

    error: (msg: string, id = "tx") => {
        toast.error(msg, {
            id,
            description: "Check your wallet or try again.",
        })
    },

    showPool: (poolAddress: string, id = "pool") => {
        toast.success("New pool created", {
            id,
            description: (
                <a
                    href={`https://edge.meteora.ag/dammv2/${poolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                >
                    Go to pool
                </a>
            ),
        })
    },
};
