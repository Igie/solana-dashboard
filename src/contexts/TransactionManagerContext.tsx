import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { txToast } from '../components/Simple/TxToast';
import { useConnection, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';

export interface TxnSignersPair {
    tx: Transaction | VersionedTransaction,
    signers?: Keypair[]
}

type TransactionManagerContextType = {
    sendTxn: (tx: Transaction | VersionedTransaction, signers?: Keypair[], options?: {
        onSuccess?: (sig: string) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<string | null>;

    sendMultiTxn: (txnSigners: TxnSignersPair[], options?: {
        onSuccess?: (sig: string[]) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<Array<string | null>>;

    solBalance: number;
    refreshBalance: () => void;
};

const TransactionManagerContext = createContext<TransactionManagerContextType | null>(null);

export const TransactionManagerProvider = ({ children }: { children: ReactNode }) => {
    const { sendTransaction, signTransaction, signAllTransactions, publicKey } = useWallet();
    const { connection } = useConnection();
    const [solBalance, setSolBalance] = useState<number>(0);

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
            const { context: { slot: minContextSlot }, value: { blockhash, lastValidBlockHeight } } = await connection.getLatestBlockhashAndContext();
            if (tx instanceof Transaction) {
                tx.feePayer = publicKey;
                tx.recentBlockhash = blockhash;
                tx.lastValidBlockHeight = lastValidBlockHeight;
            } else if (tx instanceof VersionedTransaction) {
                tx.message.recentBlockhash = blockhash;
            }

            let sig = "";

            if (signers) {
                if (signTransaction === undefined) {
                    txToast.error("signTransaction is not available!");
                    return null;
                }
                const signedTx = await signTransaction(tx);
                if (signedTx instanceof Transaction) {
                    signedTx.partialSign(...signers);
                } else if (signedTx instanceof VersionedTransaction) {
                    signedTx.sign(signers);
                }
                sig = await connection.sendRawTransaction(signedTx.serialize(), {
                    maxRetries: 3,
                    preflightCommitment: 'confirmed',
                    minContextSlot: minContextSlot,
                });

            } else {
                sig = await sendTransaction(tx, connection, { minContextSlot, preflightCommitment: 'confirmed', signers });
            }
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

            setSolBalance(await connection.getBalance(publicKey));

            if (notify) txToast.success('Transaction confirmed!', sig);
            onSuccess?.(sig);
            return sig;

        } catch (err: any) {
            console.error('Transaction error:', err);
            if (notify) txToast.error('Error sending transaction');
            onError?.(err);
            return null;
        }
    };

    const sendMultiTxn = async (
        txnSigners: TxnSignersPair[],
        { onSuccess, onError, notify = true }: {
            onSuccess?: (sig: string[]) => void;
            onError?: (err: any) => void;
            notify?: boolean;
        } = {}
    ): Promise<Array<string | null>> => {

        if (!publicKey) {
            if (notify) txToast.error('Wallet not connected.');
            return [];
        }

        try {

            if (signAllTransactions === undefined) {
                txToast.error("signAllTransactions is not available!");
                return [];
            }

            const { context: { slot: minContextSlot }, value: { blockhash, lastValidBlockHeight } } = await connection.getLatestBlockhashAndContext();

            const txns = txnSigners.map(x => x.tx)

            for (const tx of txns) {
                if (tx instanceof Transaction) {
                    tx.feePayer = publicKey;
                    tx.recentBlockhash = blockhash;
                    tx.lastValidBlockHeight = lastValidBlockHeight;
                } else if (tx instanceof VersionedTransaction) {
                    tx.message.recentBlockhash = blockhash;
                }
            }

            const signedTxns = await signAllTransactions(txns);
            const signedTxnsSignerPair = signedTxns.map((txn, i) => {
                return {
                    tx: txn,
                    signers: txnSigners[i].signers,
                }
            });

            for (const signedTxn of signedTxnsSignerPair) {
                if (signedTxn.tx instanceof Transaction) {
                    if (signedTxn.signers && signedTxn.signers.length > 0) {
                        signedTxn.tx.partialSign(...signedTxn.signers);
                    }
                } else if (signedTxn.tx instanceof VersionedTransaction) {
                    if (signedTxn.signers && signedTxn.signers.length > 0) {
                        signedTxn.tx.sign(signedTxn.signers);
                    }
                }
            }

            const result = await Promise.allSettled(signedTxnsSignerPair.map(async (x) => {
                try {
                    const sig = await connection.sendRawTransaction(x.tx.serialize(), {
                        maxRetries: 3,
                        preflightCommitment: 'confirmed',
                        minContextSlot: minContextSlot,
                    });
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

                    return sig;
                }
                catch (e) {
                    toast.error("Internal transaction error! " + e)
                }
                return null;
            }))

            if (result.every(x => x.status === 'rejected')) {
                if (notify)
                    txToast.error('Error sending all transaction!');
            }

            if (result.find(x => x.status === 'fulfilled')) {

                const successes = result.filter(x => x.status == 'fulfilled').map(x => x.value).filter(x => x !== null);
                if (notify)
                    toast.success(`Transactions ${successes.length} of ${result.length} successful!`);
                onSuccess?.(successes);
            }
            setSolBalance(await connection.getBalance(publicKey));

            return result.map(x => {
                if (x.status === 'fulfilled') {
                    return x.value;
                } else {
                    return null;
                }
            });

        } catch (err: any) {
            console.error('Transaction error:', err);
            if (notify) txToast.error('Error sending transaction');
            onError?.(err);
            return [];
        }


    }

    const refreshBalance = async () => {
        if (publicKey) {
            connection.getBalance(publicKey).then(setSolBalance);
        }
    }

    useEffect(() => {
        refreshBalance();
    }, [publicKey, connection]);


    return (
        <TransactionManagerContext.Provider value={{ sendTxn, sendMultiTxn, solBalance, refreshBalance }}>
            {children}
        </TransactionManagerContext.Provider>
    );
};

export const useTransactionManager = () => {
    const ctx = useContext(TransactionManagerContext);
    if (!ctx) throw new Error("useTransactionManager must be used within TransactionManagerProvider");
    return ctx;
};