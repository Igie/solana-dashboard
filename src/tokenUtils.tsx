import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import Decimal from "decimal.js"


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
    image?: string
    launchpad?: string
    isVerified: boolean
}

export interface TokenAccount {
    mint: string
    tokenProgram: string
    name: string
    symbol: string
    price: Decimal
    decimals: number
    image?: string
    description?: string
    value: Decimal
    amount: Decimal
    isVerified: boolean
}

export interface JupData {
    blockId: number,
    decimals: number,
    priceChange24h: number,
    usdPrice: number
}

export interface JupTokenMetadata {
    id: string,
    name: string,
    symbol: string,
    icon?: string,
    decimals?: number,
    tokenProgram: string,
    usdPrice?: number,
    launchpad?: string,
    isVerified: boolean,

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

    try {
        let i = 0;
        while (i < mintAddresses.length) {
            const end = Math.min(i + 100, mintAddresses.length);
            const response = await fetch("https://lite-api.jup.ag/tokens/v2/search?query=" + mintAddresses.slice(i, end).join(','));
            const tokenMetadata: JupTokenMetadata[] = await response.json();
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
                }
            }
            i = end;
        }

        return metadataMap;
    } catch (error) {
        console.error('Error in batch metadata fetch:', error)
        return {}
    }
}

export const fetchTokenMetadataJ = async (mintAddresses: string[]): Promise<{ [key: string]: TokenMetadata }> => {
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
            })
        }
    }

    if (mintAddresses.length > 0) {
        const metadataMap = await fetchTokenMetadataJup(mintAddresses);
        const priceMap = await fetchTokenPrices(mintAddresses, metadataMap);

        const metadataArray: TokenMetadata[] = [];
        const updatedAccounts = accounts.map(account => {
            if (metadataMap[account.mint]?.name.startsWith("kVault") ||
                !metadataMap[account.mint]?.tokenProgram ||
                account.decimals == 6
            ) return;
            const price = priceMap[account.mint]?.price || 0
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
        return [metadataArray, updatedAccounts.filter(x => x !== undefined)];
    }

    return [[], []];
}

export const fetchTokenPrices = async (mintAddresses: string[], tokenMetadata: TokenMetadataMap): Promise<{ [key: string]: { price: Decimal; } }> => {

    const allMints = ['So11111111111111111111111111111111111111112', ...mintAddresses]

    const priceMap: { [key: string]: { price: Decimal } } = {}

    for (const mint of allMints) {
        priceMap[mint] = tokenMetadata[mint];
    }
    return priceMap;

}