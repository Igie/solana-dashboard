import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, type Blockhash, type BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { txToast } from '../components/Simple/TxToast';
import { useConnection, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';

export interface TxnSignersPair {
    ixs: TransactionInstruction[],
    signers?: Keypair[]
}

type TransactionManagerContextType = {
    sendTxn: (ixs: TransactionInstruction[], cuPrice: number, signers?: Keypair[],
        blockhash?: BlockhashWithExpiryBlockHeight,
        options?: {
            onSuccess?: (sig: string) => void;
            onError?: (err: any) => void;
            notify?: boolean;
        }) => Promise<string | null>;

    sendVersionedTxn: (txn: VersionedTransaction, options?: {
        onSuccess?: (sig: string) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<string | null>;

    sendMultiTxn: (txnSigners: TxnSignersPair[], cuPrice: number,
        blockhash?: BlockhashWithExpiryBlockHeight,
        options?: {
            onSuccess?: (sig: string[]) => void;
            onError?: (err: any) => void;
            notify?: boolean;
        }) => Promise<Array<string | null>>;

    sendMultiVersionedTxn: (txns: VersionedTransaction[], options?: {
        onSuccess?: (sig: string[]) => void;
        onError?: (err: any) => void;
        notify?: boolean;
    }) => Promise<Array<string | null>>;
};

const TransactionManagerContext = createContext<TransactionManagerContextType | null>(null);

export const TransactionManagerProvider = ({ children }: { children: ReactNode }) => {
    const { sendTransaction, signTransaction, signAllTransactions, publicKey } = useWallet();
    const { connection } = useConnection();
    const [ALT, setALT] = useState<AddressLookupTableAccount | null>(null);

    const sendTxn = async (
        ixs: TransactionInstruction[], cuPrice: number, signers?: Keypair[], blockhash?: BlockhashWithExpiryBlockHeight,
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
            if (blockhash === undefined) {
                blockhash = (await connection.getLatestBlockhash())
            }
            const op = await optimiseIxs([ixs], cuPrice, blockhash)
            const tx = await generateTransaction(op.ixs[0], op.blockhash)

            let sig = "";

            if (signers) {
                if (signTransaction === undefined) {
                    txToast.error("signTransaction is not available!");
                    return null;
                }
                console.log("signing transaction with generated keypair")
                const signedTx = await signTransaction(tx);

                signedTx.sign(signers);
                sig = await connection.sendRawTransaction(signedTx.serialize(), {
                    maxRetries: 1,
                    preflightCommitment: 'confirmed',
                });

            } else {
                sig = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed', signers });
            }
            const confirmation = await connection.confirmTransaction(
                {
                    signature: sig,
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight
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
    };

    const sendVersionedTxn = async (
        txn: VersionedTransaction,
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
            console.log("serialized txn length:", txn.serialize().length);
            const blockhash = await connection.getLatestBlockhash();
            const sig = await sendTransaction(txn, connection, { preflightCommitment: 'confirmed' });

            const confirmation = await connection.confirmTransaction(
                {
                    signature: sig,
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight
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
    };

    const sendMultiTxn = async (
        txnSigners: TxnSignersPair[], cuPrice: number, blockhash?: BlockhashWithExpiryBlockHeight,
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
            if (blockhash === undefined) {
                blockhash = await connection.getLatestBlockhash();
            }

            const op = await optimiseIxs(txnSigners.map(x => x.ixs), cuPrice, blockhash);
            const txns = await generateTransactions(op.ixs, op.blockhash.blockhash);

            const signedTxns = await signAllTransactions(txns);
            const signedTxnsSignerPair = signedTxns.map((txn, i) => {
                return {
                    tx: txn,
                    signers: txnSigners[i].signers,
                }
            });

            for (const signedTxn of signedTxnsSignerPair) {

                if (signedTxn.signers && signedTxn.signers.length > 0) {
                    signedTxn.tx.sign(signedTxn.signers);
                }
            }

            const result = await Promise.allSettled(signedTxnsSignerPair.map(async (x) => {
                try {
                    const sig = await connection.sendRawTransaction(x.tx.serialize(), {
                        maxRetries: 1,
                        preflightCommitment: 'confirmed',
                    });
                    const confirmation = await connection.confirmTransaction(
                        {
                            signature: sig,
                            blockhash: blockhash!.blockhash,
                            lastValidBlockHeight: blockhash!.lastValidBlockHeight
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

    const sendMultiVersionedTxn = async (
        txns: VersionedTransaction[],
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
            const blockhash = await connection.getLatestBlockhash();

            console.log("serialized txn lengths:", txns.map(x => x.serialize().length));


            const signedTxns = await signAllTransactions(txns);


            const result = await Promise.allSettled(signedTxns.map(async (x) => {
                try {
                    const sig = await connection.sendRawTransaction(x.serialize(), {
                        maxRetries: 1,
                        preflightCommitment: 'confirmed',
                    });
                    const confirmation = await connection.confirmTransaction(
                        {
                            signature: sig,
                            blockhash: blockhash!.blockhash,
                            lastValidBlockHeight: blockhash!.lastValidBlockHeight
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

    const fetchALT = async () => {
        const alt = await connection.getAddressLookupTable(new PublicKey("Fzvi6MFN9HVGYJ6p5vKg5rdyba2LRxhgB3BzvKRbY4Hh"))
        setALT(alt.value);
    }

    const getALT = () => {
        return ALT;
    }

    //100_000 is 1 lamport per CU
    const optimiseIxs = async (ixs: TransactionInstruction[][], cuPrice: number, blockhash: BlockhashWithExpiryBlockHeight): Promise<{ ixs: TransactionInstruction[][], blockhash: BlockhashWithExpiryBlockHeight }> => {

        if (blockhash === undefined)
            blockhash = await connection.getLatestBlockhash("confirmed");
        const alt = getALT();
        const settled = await Promise.allSettled(ixs.map(async innerIxs => {
            const transactionMesage = new TransactionMessage({
                instructions: innerIxs,
                payerKey: publicKey!,
                recentBlockhash: blockhash.blockhash,
            })
            const messageV0 = transactionMesage.compileToV0Message(alt ? [alt] : []);

            const versioned = new VersionedTransaction(messageV0);

            console.log(bs58.encode(Buffer.from(versioned.serialize())))
            const sim = await connection.simulateTransaction(versioned);
            if (sim.value.err) {
                console.log("Failed to simulate transaction")
                console.error(sim);
                txToast.error("Failed to simulate transaction!");
                
                return null;
            } else {
                const finalIxs: TransactionInstruction[] = [];

                finalIxs.push(
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
                    ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(sim.value.unitsConsumed! * 1.1, 5000) })
                );
                finalIxs.push(...innerIxs);
                return finalIxs;
            }
        }));
        const ixsFinal = settled.filter(x => x.status === 'fulfilled').map(x => x.value).filter(x => x !== null);
        return { ixs: ixsFinal, blockhash: blockhash };
    }

    const generateTransaction = async (ixs: TransactionInstruction[], recentBlockHash: BlockhashWithExpiryBlockHeight): Promise<VersionedTransaction> => {
        const alt = getALT();
        const transactionMesage = new TransactionMessage({
            instructions: ixs,
            payerKey: publicKey!,
            recentBlockhash: recentBlockHash.blockhash,
        })
        const messageV0 = transactionMesage.compileToV0Message(alt ? [alt] : []);
        const versioned = new VersionedTransaction(messageV0);

        console.log(`generated transaction with ${ixs.length} instructions: size ${versioned.serialize().length}`)
        return versioned;
    }

    const generateTransactions = async (ixs: TransactionInstruction[][], blockhash: Blockhash): Promise<VersionedTransaction[]> => {
        const alt = getALT();
        const result: VersionedTransaction[] = [];
        for (const innerIxs of ixs) {
            const transactionMesage = new TransactionMessage({
                instructions: innerIxs,
                payerKey: publicKey!,
                recentBlockhash: blockhash,
            })
            const messageV0 = transactionMesage.compileToV0Message(alt ? [alt] : []);
            const versioned = new VersionedTransaction(messageV0);
            console.log(`generated transaction with ${innerIxs.length} instructions, size ${versioned.serialize().length}`);
            result.push(versioned);
        }
        return result;
    }

    useEffect(() => {
        console.log("TransactionManagerProvider mounted");
        fetchALT();
    }, []);

    return (
        <TransactionManagerContext.Provider value={{ sendTxn, sendVersionedTxn, sendMultiTxn, sendMultiVersionedTxn }}>
            {children}
        </TransactionManagerContext.Provider>
    );
};

export const useTransactionManager = () => {
    const ctx = useContext(TransactionManagerContext);
    if (!ctx) throw new Error("useTransactionManager must be used within TransactionManagerProvider");
    return ctx;
};