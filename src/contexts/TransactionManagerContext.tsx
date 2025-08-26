import { createContext, useContext, type ReactNode } from 'react';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { txToast } from '../components/Simple/TxToast';
import { useConnection, useWallet } from '@jup-ag/wallet-adapter';

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
    // sendMultiTxn: (txnSigners: TxnSignersPair[], options?: {
    //     onSuccess?: (sig: string[]) => void;
    //     onError?: (err: any) => void;
    //     notify?: boolean;
    // }) => Promise<Array<string | null>>;
};

const TransactionManagerContext = createContext<TransactionManagerContextType | null>(null);

export const TransactionManagerProvider = ({ children }: { children: ReactNode }) => {
    const { sendTransaction, signTransaction, publicKey } = useWallet();
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

                if (notify) txToast.success('Transaction confirmed!', sig);
                onSuccess?.(sig);
                return sig;

            } catch (err: any) {
                console.error('Transaction error:', err);
                if (notify) txToast.error('Error sending transaction');
                onError?.(err);
                return null;
            }
        } catch (err: any) {
            console.log(err)
            return null;
        }
    };

    // const sendMultiTxn = async (
    //     txnSigners: TxnSignersPair[],
    //     { onSuccess, onError, notify = true }: {
    //         onSuccess?: (sig: string[]) => void;
    //         onError?: (err: any) => void;
    //         notify?: boolean;
    //     } = {}
    // ): Promise<Array<string|null>> => {
    //     if (!publicKey) {
    //         if (notify) txToast.error('Wallet not connected.');
    //         return [];
    //     }
    //     if (!signAllTransactions) {
    //         if (notify) txToast.error('No method to sign multiple transactions!');
    //         return [];
    //     }

    //     try {
    //         try {
    //             const { context: { slot: minContextSlot }, value: { blockhash, lastValidBlockHeight } } = await connection.getLatestBlockhashAndContext();
    //             for (const pair of txnSigners) {
    //                 if (pair.tx instanceof Transaction) {
    //                     pair.tx.feePayer = publicKey;
    //                     pair.tx.recentBlockhash = blockhash;
    //                     pair.tx.lastValidBlockHeight = lastValidBlockHeight;

    //                     if (pair.signers)
    //                         pair.tx.sign(...pair.signers!)

    //                 } else if (pair.tx instanceof VersionedTransaction) {
    //                     pair.tx.message.recentBlockhash = blockhash;
    //                     if (pair.signers)
    //                         pair.tx.sign(pair.signers!)
    //                 }
    //             }

    //             let confirmed = 0;
    //             const result = [];
    //             const signedTxns = await signAllTransactions!(txnSigners.map(x => x.tx));
    //             for (const [i, txn] of signedTxns.entries()) {
    //                 if (notify) toast.loading("Sending transaction " + i + 1);
    //                 const signature = await connection.sendRawTransaction(txn.serialize());
    //                 const confirmation = await connection.confirmTransaction(
    //                     {
    //                         signature: signature,
    //                         blockhash: blockhash,
    //                         lastValidBlockHeight: lastValidBlockHeight
    //                     }, 'confirmed');

    //                 if (confirmation.value.err) {
    //                     result.push(signature);
    //                     confirmed++;
    //                 }
    //             }
    //             if (notify) toast.success(`Done sending, confirmed:${confirmed} out of ${signedTxns.length}`);
    //             onSuccess?.(result);
    //             return result;
    //         } catch (err: any) {
    //             console.error('Transaction error:', err);
    //             if (notify) txToast.error('Error sending transaction');
    //             onError?.(err);
    //             return [];
    //         }
    //     } catch (err: any) {
    //         console.log(err)
    //         return [];
    //     }
    // };

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