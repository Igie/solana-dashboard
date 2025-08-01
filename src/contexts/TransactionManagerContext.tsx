import { createContext, useContext, type ReactNode } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { txToast } from '../components/Simple/TxToast';

type TransactionManagerContextType = {
    sendTxn: (tx: Transaction | VersionedTransaction, signers?: Keypair[], options?: {
        onSuccess?: (sig: string) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<string | null>;
};

const TransactionManagerContext = createContext<TransactionManagerContextType | null>(null);

export const TransactionManagerProvider = ({ children }: { children: ReactNode }) => {
    const { connection } = useConnection();
    const { sendTransaction, publicKey } = useWallet();

    const sendTxn = async (
        tx: Transaction | VersionedTransaction, signers?: Keypair[],
        { onSuccess, onError, notify = true }: {
            onSuccess?: (sig: string) => void;
            onError?: (err: any) => void;
            notify?: boolean;
        } = {}
    ): Promise<string | null> => {
        if (!publicKey) {
            if (notify) txToast.error('Wallet not connected.');
            return null;
        }

        try {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            if (tx instanceof Transaction) {
                tx.feePayer = publicKey;
                tx.recentBlockhash = blockhash;
                tx.lastValidBlockHeight = lastValidBlockHeight;
                if (signers)
                    tx.sign(...signers!)

            } else if (tx instanceof VersionedTransaction) {
                tx.message.recentBlockhash = blockhash;
                if (signers)
                    tx.sign(signers!)

            }






            const sig = await sendTransaction(tx, connection);
            if (notify) txToast.loading('Transaction sent...');

            const confirmation = await connection.confirmTransaction(
                {
                    signature: sig,
                    blockhash: blockhash,
                    lastValidBlockHeight: lastValidBlockHeight
                },
                'confirmed');

            if (confirmation.value.err) {
                if (notify) txToast.error('Transaction failed');
                onError?.(confirmation.value.err);
                return null;
            }

            if (notify) txToast.success('Transaction confirmed!', sig);
            onSuccess?.(sig);
            return sig;
        } catch (err) {
            console.error('Transaction error:', err);
            if (notify) txToast.error('Error sending transaction');
            onError?.(err);
            return null;
        }
    };

    return (
        <TransactionManagerContext.Provider value={{ sendTxn }}>
            {children}
        </TransactionManagerContext.Provider>
    );
};

export const useTransactionManager = () => {
    const ctx = useContext(TransactionManagerContext);
    if (!ctx) throw new Error("useTransactionManager must be used within TransactionManagerProvider");
    return ctx;
};