import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"



export interface TokenMetadataMap {
    [key: string]: TokenMetadata
}

export interface TokenMetadata {
    mint: string
    tokenProgram: string
    name: string
    symbol: string
    price: number
    decimals: number
    image?: string
    description?: string


}

export interface TokenAccount {
    mint: string
    tokenProgram: string
    name: string
    symbol: string
    price: number
    decimals: number
    image?: string
    description?: string
    value: number
    amount: number
}

export const metadataToAccounts = (tm: TokenMetadata[]): TokenAccount[] => {
    return tm.map(x => ({
        ...x,
        amount: 0,
        value: 0
    }));
}

export const GetTokenMetadataMap = (metadata: TokenMetadata[]): TokenMetadataMap => {
    const metadataMap: { [key: string]: TokenMetadata } = {}


    metadata.map((x) => {
        metadataMap[x.mint] = x;
    });

    return metadataMap;

}

export const fetchTokenMetadata = async (c: Connection, mintAddresses: string[]): Promise<{ [key: string]: TokenMetadata }> => {
    const metadataMap: { [key: string]: TokenMetadata } = {}
    if (mintAddresses.length === 0)
        return metadataMap;
    try {

        const response = await fetch(c.rpcEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'metadata-batch',
                method: 'getAssetBatch',
                params: {
                    ids: mintAddresses
                }
            })
        })

        const data = await response.json();

        if (data.result) {
            for (let i = 0; i < data.result.length; i++) {
                let r = data.result[i];
                if (r === null) {
                    continue
                }

                const metadata = r.content.metadata;
                const mint = r.id;
                metadataMap[mint] = {
                    mint: mint,
                    name: metadata.name || 'Unknown Token',
                    tokenProgram: r.token_info?.token_program,
                    symbol: metadata.symbol || 'UNK',
                    price: r.token_info?.price_info?.price_per_token || 0,
                    decimals: r.token_info?.decimals || 0,
                    image: r.content.files?.[0]?.uri || metadata.image,
                    description: metadata.description
                }
            }
        }

        return metadataMap;
    } catch (error) {
        console.error('Error in batch metadata fetch:', error)
        return {}
    }
}

export const fetchTokenAccounts = async (c: Connection, publicKey: PublicKey): Promise<[TokenMetadata[], TokenAccount[]]> => {
    if (!publicKey || !c) return [[], []];

    // Get all token accounts for the wallet

    const tokenAccounts = (await c.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
    )).value

    const tokenAccounts2022 = (await c.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_2022_PROGRAM_ID }
    )).value
    tokenAccounts.push(...tokenAccounts2022);
    const accounts: TokenAccount[] = []
    const mintAddresses: string[] = ["So11111111111111111111111111111111111111112"]

    accounts.push({
                mint: "So11111111111111111111111111111111111111112",
                tokenProgram: "",
                amount: (await c.getBalance(publicKey))/ (LAMPORTS_PER_SOL),
                decimals: 9,
                symbol: 'Loading...',
                name: 'Loading...',
                price: 0,
                value: 0
            })

    for (const account of tokenAccounts) {
        const parsedInfo = account.account.data.parsed.info
        const mintAddress = parsedInfo.mint
        const amount = parsedInfo.tokenAmount.uiAmount
        const decimals = parsedInfo.tokenAmount.decimals

        if (amount > 0) {
            mintAddresses.push(mintAddress)
            accounts.push({
                mint: mintAddress,
                tokenProgram: "",
                amount,
                decimals,
                symbol: 'Loading...',
                name: 'Loading...',
                price: 0,
                value: 0
            })
        }
    }

    if (mintAddresses.length > 0) {

        const metadataMap = await fetchTokenMetadata(c, mintAddresses);
        const priceMap = await fetchTokenPrices(mintAddresses, metadataMap);

        const metadataArray: TokenMetadata[] = [];
        const updatedAccounts = accounts.map(account => {
            const price = priceMap[account.mint]?.price || 0
            const value = account.amount * price
            metadataArray.push(metadataMap[account.mint]);
            return {
                ...account,
                tokenProgram: metadataMap[account.mint]?.tokenProgram,
                symbol: metadataMap[account.mint]?.symbol || 'UNK',
                name: metadataMap[account.mint]?.name || 'Unknown Token',
                image: metadataMap[account.mint]?.image,
                price,
                value,
            }
        })


        return [metadataArray, updatedAccounts];
    }



    return [[], []];
}

export const fetchTokenPrices = async (mintAddresses: string[], tokenMetadata: TokenMetadataMap): Promise<{ [key: string]: { price: number; } }> => {

    const allMints = ['So11111111111111111111111111111111111111112', ...mintAddresses]

    const priceMap: { [key: string]: { price: number } } = {}

    for (const mint of allMints) {
        priceMap[mint] = tokenMetadata[mint];
    }
    return priceMap;

}