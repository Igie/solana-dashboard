import React, { createContext, useContext, useRef, } from 'react'
import Decimal from 'decimal.js'
import { sleep } from '../constants'

export interface TokenMetadata {
    mint: string
    tokenProgram: string
    name: string
    symbol: string
    price: Decimal
    decimals: number
    supply: number
    image?: string
    launchpad?: string
    isVerified: boolean
    mintAuthority?: string
    freezeAuthority?: string

    lastUpdated: number,
}

export interface JupTokenMetadata {
    id: string
    name: string
    symbol: string
    icon?: string
    decimals?: number
    totalSupply: number
    tokenProgram: string
    usdPrice?: number
    launchpad?: string
    isVerified: boolean
    mintAuthority?: string
    freezeAuthority?: string
}

export interface TokenMetadataMap {
    [key: string]: TokenMetadata
}

export const GetTokenMetadataMap = (metadata: TokenMetadata[]): TokenMetadataMap => {
    const metadataMap: TokenMetadataMap = {}
    metadata.map((x) => {
        metadataMap[x.mint] = x;
    });
    return metadataMap;
}

const UPDATE_METADATA_AGE = 2000;

interface TokenMetadataContextType {
    fetchTokenMetadata(mints: string[], acceptAge?: number): Promise<TokenMetadataMap>,
}

const TokenMetadataContext = createContext<TokenMetadataContextType>({
    fetchTokenMetadata: async () => { 
        console.log("bad")
        return {} 
    },
})

export const useTokenMetadata = () => useContext(TokenMetadataContext)

export const TokenMetadataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

    const tokenMetadataMap = useRef<TokenMetadataMap>({});

    const fetchTokenMetadata = async (mintAddresses: string[], acceptAge: number | undefined): Promise<{ [key: string]: TokenMetadata }> => {
        const result: { [key: string]: TokenMetadata } = {}
        const mintAddressSet = [...new Set(mintAddresses)];
        console.log("provided mints:", mintAddresses.length, "unique mints:", mintAddressSet.length);
        if (mintAddressSet.length === 0)
            return result;
        console.log("fetching jup metadata", mintAddressSet.length)
        try {
            if (acceptAge === undefined) acceptAge = UPDATE_METADATA_AGE;
            const currentTime = Date.now();
            const updateNeeded: string[] = []
            for (const mint of mintAddressSet) {
                if (!tokenMetadataMap.current[mint])
                    updateNeeded.push(mint)
                else if (currentTime - tokenMetadataMap.current[mint].lastUpdated > acceptAge)
                    updateNeeded.push(mint)
                else
                    result[mint] = tokenMetadataMap.current[mint];
            }

            console.log("update needed", updateNeeded.length);
            console.log("existing", Object.entries(result).length);

            while (updateNeeded.length > 0) {
                const innerMints = updateNeeded.splice(0, 100);
                const response = await fetch("https://lite-api.jup.ag/tokens/v2/search?query=" + innerMints.join(','));
                const tokenMetadata: JupTokenMetadata[] = await response.json();
                for (const tm of tokenMetadata) {
                    const tmItem = {
                        mint: tm.id,
                        name: tm.name || 'Unknown Token',
                        tokenProgram: tm.tokenProgram,
                        symbol: tm.symbol || 'UNK',
                        price: tm.usdPrice ? new Decimal(tm.usdPrice) : new Decimal(0),
                        decimals: tm.decimals || 0,
                        image: tm.icon,
                        launchpad: tm.launchpad,
                        isVerified: tm.isVerified,
                        supply: tm.totalSupply,
                        mintAuthority: tm.mintAuthority,
                        freezeAuthority: tm.freezeAuthority,
                        lastUpdated: currentTime,
                    }
                    tokenMetadataMap.current[tm.id] = tmItem;
                    result[tm.id] = tmItem;
                }
                if (updateNeeded.length > 0)
                    await sleep(1000)
            }
            return result;
        } catch (error) {
            console.error('Error in batch metadata fetch:', error)
            return {}
        }
    }

    return (
        <TokenMetadataContext.Provider value={{ fetchTokenMetadata }}>
            {children}
        </TokenMetadataContext.Provider>
    )
}
