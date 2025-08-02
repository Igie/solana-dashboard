import { createContext, useContext, type ReactNode } from 'react';
import { Keypair, SendTransactionError, Transaction, VersionedTransaction } from '@solana/web3.js';
import { txToast } from '../components/Simple/TxToast';
import { WalletSendTransactionError } from '@solana/wallet-adapter-base';
import { useConnection, useWallet } from '@jup-ag/wallet-adapter';

type TransactionManagerContextType = {
    sendTxn: (tx: Transaction | VersionedTransaction, signers?: Keypair[], options?: {
        onSuccess?: (sig: string) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<string | null>;
};

const TransactionManagerContext = createContext<TransactionManagerContextType | null>(null);

export const TransactionManagerProvider = ({ children }: { children: ReactNode }) => {
    const { sendTransaction, publicKey } = useWallet();
    const { connection } = useConnection();

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
            const { context: { slot:minContextSlot }, value: { blockhash, lastValidBlockHeight } } = await connection.getLatestBlockhashAndContext();
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
            if (tx instanceof Transaction) {
                const r = await connection.simulateTransaction(tx)
                console.log(r);
            }
            let sig = "";
            try {
                sig = await sendTransaction(tx, connection, {minContextSlot});
            } catch (err: any) {
                if (err instanceof WalletSendTransactionError) {
                    console.log("transaction error logs:")

                    console.log(err.error);
                    console.log(err.message);
                    console.log(err.name);
                }
                if (notify) txToast.error('Error sending transaction');
                onError?.(err);
                return null;
            }
            if (notify) txToast.loading('Transaction sent...');

            const confirmation = await connection.confirmTransaction(
                {
                    signature: sig,
                    blockhash: blockhash,
                    lastValidBlockHeight: lastValidBlockHeight
                }, 'confirmed');

            if (confirmation.value.err) {
                if (notify) txToast.error('Transaction failed');
                onError?.(confirmation.value.err);
                return null;
            }

            if (notify) txToast.success('Transaction confirmed!', sig);
            onSuccess?.(sig);
            return sig;

        } catch (err: any) {
            if (err instanceof SendTransactionError) {
                console.log(await err.getLogs(connection));
            }
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