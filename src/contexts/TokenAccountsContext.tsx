import React, { createContext, useContext, useEffect, useState } from 'react'
import { fetchTokenAccounts, type TokenAccount, type TokenMetadata } from '../tokenUtils'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import Decimal from "decimal.js"
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface TokenAccountsContextType {
    tokenAccounts: TokenAccount[]
    tokenMetadata: TokenMetadata[]
    solBalance: Decimal
    loading: boolean
    refreshTokenAccounts: () => Promise<{ tokenAccounts: TokenAccount[], tokenMetadata: TokenMetadata[] }>
}

const TokenAccountsContext = createContext<TokenAccountsContextType>({
    tokenAccounts: [],
    tokenMetadata: [],
    solBalance: new Decimal(0),
    loading: false,
    refreshTokenAccounts: async () => {
        return { tokenAccounts: [], tokenMetadata: [] }
    },
})

export const useTokenAccounts = () => useContext(TokenAccountsContext)

export const TokenAccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet()
    const { connection } = useConnection()

    const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([])
    const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata[]>([])

    const [solBalance, setSolBalance] = useState<Decimal>(new Decimal(0));

    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!connection || !publicKey) return;
        const accountChangeId = connection.onAccountChange(publicKey!, x => {
            setSolBalance(new Decimal(x.lamports).div(LAMPORTS_PER_SOL))
            console.log(x);
        }, { commitment: "confirmed", encoding: "jsonParsed" })
        connection.getBalance(publicKey).then(x => setSolBalance(new Decimal(x).div(LAMPORTS_PER_SOL)));

        return () => {
            connection.removeAccountChangeListener(accountChangeId)
        }
    }, [connection, publicKey!]);

    useEffect(() => {
        refreshTokenAccounts();

    }, []);

    const refreshTokenAccounts = async () => {
        if (!publicKey || !connection) return { tokenAccounts: [], tokenMetadata: [] }
        setLoading(true)
        try {
            // Get all token accounts owned by the user

            const [tokenMetadata, tokenAccounts] = await fetchTokenAccounts(connection, publicKey);
            const sortedAccounts = tokenAccounts.sort((x, y) => (y.price.toNumber() * y.amount.toNumber()) - (x.price.toNumber() * x.amount.toNumber()))
            setTokenAccounts(sortedAccounts);
            setTokenMetadata(tokenMetadata);
            setLoading(false);
            return { tokenAccounts, tokenMetadata }
        } catch (err) {
            console.error('Failed to fetch token accounts:', err)
            setTokenAccounts([])
            setTokenMetadata([]);
        }
        setLoading(false)
        return { tokenAccounts: [], tokenMetadata: [] }
    }
    return (
        <TokenAccountsContext.Provider value={{ tokenAccounts, tokenMetadata, solBalance, loading, refreshTokenAccounts }}>
            {children}
        </TokenAccountsContext.Provider>
    )
}
