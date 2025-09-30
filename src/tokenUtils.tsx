import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import Decimal from "decimal.js"
import { sleep } from "./constants"


export interface TokenMetadataMap {
    [key: string]: TokenMetadata
}

export interface TokenAccountMap {
    [key: string]: TokenAccount
}

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
}

export interface TokenAccount {
    mint: string
    tokenProgram: string
    name: string
    symbol: string
    price: Decimal
    decimals: number
    supply: number,
    image?: string
    description?: string
    value: Decimal
    amount: Decimal
    isVerified: boolean
    mintAuthority?: string
    freezeAuthority?: string
}

export interface JupData {
    blockId: number
    decimals: number
    priceChange24h: number
    usdPrice: number
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

export interface JupDataMap {
    [key: string]: JupData
}

export const metadataToAccounts = (tm: TokenMetadata[]): TokenAccount[] => {
    return tm.map(x => ({
        ...x,
        amount: new Decimal(0),
        value: new Decimal(0)
    }));
}

export const GetTokenMetadataMap = (metadata: TokenMetadata[]): TokenMetadataMap => {
    const metadataMap: TokenMetadataMap = {}
    metadata.map((x) => {
        metadataMap[x.mint] = x;
    });
    return metadataMap;
}

export const GetTokenAccountMap = (tokenAccounts: TokenAccount[]): TokenAccountMap => {
    const tokenAccountMap: TokenAccountMap = {}
    tokenAccounts.map((x) => {
        tokenAccountMap[x.mint] = x;
    });
    return tokenAccountMap;
}

export const fetchTokenMetadataJup = async (mintAddresses: string[]): Promise<{ [key: string]: TokenMetadata }> => {
    const metadataMap: { [key: string]: TokenMetadata } = {}
    if (mintAddresses.length === 0)
        return metadataMap;

    console.log("fetching jup metadata", mintAddresses.length)
    try {
        while (mintAddresses.length > 0) {
            const innerMints = mintAddresses.splice(0, 100);
            const response = await fetch("https://lite-api.jup.ag/tokens/v2/search?query=" + innerMints.join(','));
            const tokenMetadata: JupTokenMetadata[] = await response.json();
            //console.log("Jup returned " + tokenMetadata.length + " tokens of " + innerMints.length)
            for (const tm of tokenMetadata) {
                metadataMap[tm.id] = {
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
                    freezeAuthority: tm.freezeAuthority
                }
            }
            if (mintAddresses.length > 0)
                await sleep(1000)
        }

        return metadataMap;
    } catch (error) {
        console.error('Error in batch metadata fetch:', error)
        return {}
    }
}

export const fetchTokenMetadata = async (mintAddresses: string[]): Promise<{ [key: string]: TokenMetadata }> => {
    return await fetchTokenMetadataJup(mintAddresses);
}

export const fetchTokenAccounts = async (c: Connection, publicKey: PublicKey): Promise<[TokenMetadata[], TokenAccount[]]> => {
    if (!publicKey || !c) return [[], []];

    // Get all token accounts for the wallet

    const tokenAccountsSPL = (await c.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
    )).value

    const tokenAccountsSPL2022 = (await c.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_2022_PROGRAM_ID }
    )).value


    const tokenAccounts = [...tokenAccountsSPL, ...tokenAccountsSPL2022];
    const accounts: TokenAccount[] = []
    const mintAddresses: string[] = ["So11111111111111111111111111111111111111112"]

    accounts.push({
        mint: "So11111111111111111111111111111111111111112",
        tokenProgram: "",
        amount: new Decimal(await c.getBalance(publicKey)).div(LAMPORTS_PER_SOL),
        decimals: 9,
        symbol: 'Loading...',
        name: 'Loading...',
        price: new Decimal(0),
        value: new Decimal(0),
        isVerified: false,
        supply: 0,

    })

    for (const account of tokenAccounts) {
        const parsedInfo = account.account.data.parsed.info
        const mintAddress = parsedInfo.mint
        const decimals = parsedInfo.tokenAmount.decimals
        const amount = new Decimal(parsedInfo.tokenAmount.amount).div(Decimal.pow(10, decimals))

        if (amount.greaterThan(0) && decimals > 0) {
            mintAddresses.push(mintAddress)
            accounts.push({
                mint: mintAddress,
                tokenProgram: "",
                amount,
                decimals,
                symbol: 'Loading...',
                name: 'Loading...',
                price: new Decimal(0),
                value: new Decimal(0),
                isVerified: false,
                supply: 0,
                mintAuthority: undefined,
                freezeAuthority: undefined,
            })
        }
    }

    if (mintAddresses.length > 0) {
        const metadataMap = await fetchTokenMetadataJup(mintAddresses);

        const metadataArray: TokenMetadata[] = [];
        const updatedAccounts = accounts.map(account => {
            if (metadataMap[account.mint]?.name.startsWith("kVault") ||
                !metadataMap[account.mint]?.tokenProgram
            ) return;
            const price: Decimal = metadataMap[account.mint].price;
            const value = account.amount.mul(price)
            metadataArray.push(metadataMap[account.mint]);
            return {
                ...account,
                tokenProgram: metadataMap[account.mint]?.tokenProgram,
                symbol: metadataMap[account.mint]?.symbol || 'UNK',
                name: metadataMap[account.mint]?.name || 'Unknown Token',
                image: metadataMap[account.mint]?.image,
                price,
                value,
                isVerified: metadataMap[account.mint]?.isVerified,
            }
        })
        const finalAccounts = updatedAccounts.filter(x => x !== undefined)
        return [metadataArray, finalAccounts];
    }

    return [[], []];
}