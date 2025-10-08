import React, { createContext, useContext, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@jup-ag/wallet-adapter'
import Decimal from "decimal.js"
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { GetPoolInfoMap, type PoolDetailedInfo, type PoolDetailedInfoMap, type PoolInfo } from '../constants'
import { feeNumeratorToBps, getBaseFeeNumerator, getFeeNumerator, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk'
import { useCpAmm } from '../contexts/CpAmmContext'
import { useGetSlot } from '../contexts/GetSlotContext'
import { useDammV2PoolsWebsocket } from './Dammv2PoolContext'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { GetTokenMetadataMap, useTokenMetadata, type TokenMetadata, type TokenMetadataMap } from './TokenMetadataContext'

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
    lamports: number,
    isVerified: boolean
    mintAuthority?: string
    freezeAuthority?: string
    lastUpdated: number,
}

export const metadataToAccounts = (tm: TokenMetadata[]): TokenAccount[] => {
    return tm.map(x => ({
        ...x,
        amount: new Decimal(0),
        value: new Decimal(0),
        lamports: 0,
    }));
}

export interface TokenAccountMap {
    [key: string]: TokenAccount
}

export const GetTokenAccountMap = (tokenAccounts: TokenAccount[]): TokenAccountMap => {
    const tokenAccountMap: TokenAccountMap = {}
    tokenAccounts.map((x) => {
        tokenAccountMap[x.mint] = x;
    });
    return tokenAccountMap;
}

interface TokenAccountsContextType {
    allTokenAccounts: TokenAccount[]
    fullTokenAccounts: TokenAccount[]
    emptyTokenAccounts: TokenAccount[]
    tokenMetadata: TokenMetadata[]
    existingPools: PoolDetailedInfoMap
    solBalance: Decimal
    loading: boolean
    refreshTokenAccounts: () => Promise<{ tokenAccounts: TokenAccount[], tokenMetadata: TokenMetadata[] }>
    fetchPools: (mint: string) => Promise<void>
    updateTokenAccounts: (tokenAccounts: (TokenAccount | undefined)[]) => void
}

const TokenAccountsContext = createContext<TokenAccountsContextType>({
    allTokenAccounts: [],
    fullTokenAccounts: [],
    emptyTokenAccounts: [],
    tokenMetadata: [],
    existingPools: {},
    solBalance: new Decimal(0),
    loading: false,
    refreshTokenAccounts: async () => {
        return { tokenAccounts: [], tokenMetadata: [] }
    },
    fetchPools: async (_: string) => { },
    updateTokenAccounts: () => { },
})

export const useTokenAccounts = () => useContext(TokenAccountsContext)

export const TokenAccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { publicKey } = useWallet();
    const { connection } = useConnection();
    const { cpAmm } = useCpAmm();
    const { fetchTokenMetadata } = useTokenMetadata();
    const { updatedPools } = useDammV2PoolsWebsocket();
    const { getSlot } = useGetSlot();

    const [allTokenAccounts, setAllTokenAccounts] = useState<TokenAccount[]>([])
    const [fullTokenAccounts, setFullTokenAccounts] = useState<TokenAccount[]>([])
    const [emptyTokenAccounts, setEmptyTokenAccounts] = useState<TokenAccount[]>([])
    const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata[]>([])

    const [existingPools, setExistingPools] = useState<PoolDetailedInfoMap>({});
    const [fetchingPools, setFetchingPools] = useState(false);

    const [solBalance, setSolBalance] = useState<Decimal>(new Decimal(0));

    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (updatedPools && updatedPools.length > 0) {
            let update = false;

            const existing = GetPoolInfoMap(Object.entries(existingPools).map(x => x[1].poolInfo));
            for (const updated of updatedPools) {
                if (updated.account.tokenAMint.toBase58() !== NATIVE_MINT.toBase58() && fullTokenAccounts.find(x => x.mint === updated.account.tokenAMint.toBase58())) {
                    existing[updated.publicKey.toBase58()] = updated;
                    update = true;
                    console.log(updated.account.tokenAMint.toBase58());
                }
            }
            if (update) {
                mapPools(Object.entries(existing).map(x => x[1]), GetTokenMetadataMap(fullTokenAccounts));
                console.log("Found pools");

            }
        }
    }, [updatedPools])

    useEffect(() => {
        if (!connection || !publicKey) return;
        const accountChangeId = connection.onAccountChange(publicKey!, x => {
            setSolBalance(new Decimal(x.lamports).div(LAMPORTS_PER_SOL))
        }, { commitment: "confirmed", encoding: "jsonParsed" })
        connection.getBalance(publicKey).then(x => setSolBalance(new Decimal(x).div(LAMPORTS_PER_SOL)));

        return () => {
            connection.removeAccountChangeListener(accountChangeId)
        }
    }, [connection, publicKey!]);

    useEffect(() => {
        refreshTokenAccounts();
    }, []);

    const fetchTokenAccounts = async (): Promise<[TokenMetadata[], TokenAccount[]]> => {
        if (!publicKey || !connection) return [[], []];

        // Get all token accounts for the wallet
        const [tokenAccountsSPL, tokenAccountsSPL2022] = await Promise.all([
            connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID }
            ),
            connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_2022_PROGRAM_ID }
            )]);


        const tokenAccounts = [...tokenAccountsSPL.value, ...tokenAccountsSPL2022.value];
        const accounts: TokenAccount[] = []
        const mintAddresses: string[] = ["So11111111111111111111111111111111111111112"]

        const currentTime = Date.now();

        accounts.push({
            mint: "So11111111111111111111111111111111111111112",
            tokenProgram: "",
            amount: new Decimal(await connection.getBalance(publicKey)).div(LAMPORTS_PER_SOL),
            decimals: 9,
            symbol: 'Loading...',
            name: 'Loading...',
            price: new Decimal(0),
            value: new Decimal(0),
            lamports: 0,
            isVerified: false,
            supply: 0,
            lastUpdated: currentTime,
        })

        for (const account of tokenAccounts) {
            const parsedInfo = account.account.data.parsed.info
            const mintAddress = parsedInfo.mint
            const decimals = parsedInfo.tokenAmount.decimals
            const amount = new Decimal(parsedInfo.tokenAmount.amount).div(Decimal.pow(10, decimals))
            if (amount.eq(0)) {
                console.log(account.pubkey.toBase58())
                console.log(parsedInfo.tokenAmount)
            }
            if (decimals > 0) {
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
                    lamports: account.account.lamports,
                    isVerified: false,
                    supply: 0,
                    mintAuthority: undefined,
                    freezeAuthority: undefined,
                    lastUpdated: currentTime,
                })
            }
        }

        if (mintAddresses.length > 0) {
            const metadataMap = await fetchTokenMetadata([...new Set(mintAddresses)]);

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

    const refreshTokenAccounts = async () => {
        if (!publicKey || !connection) return { tokenAccounts: [], tokenMetadata: [] }
        setLoading(true)
        try {
            const [tokenMetadata, tokenAccounts] = await fetchTokenAccounts();
            const sortedAccounts = tokenAccounts.sort((x, y) => (y.price.toNumber() * y.amount.toNumber()) - (x.price.toNumber() * x.amount.toNumber()))
            setAllTokenAccounts(sortedAccounts);
            setFullTokenAccounts(sortedAccounts.filter(x => x.amount.gt(0)));
            setEmptyTokenAccounts(sortedAccounts.filter(x => x.amount.eq(0)));
            setTokenMetadata(tokenMetadata);
            setLoading(false);
            return { tokenAccounts, tokenMetadata }
        } catch (err) {
            console.error('Failed to fetch token accounts:', err)
            setAllTokenAccounts([]);
            setFullTokenAccounts([]);
            setEmptyTokenAccounts([]);
            setTokenMetadata([]);
        }
        setLoading(false)
        return { tokenAccounts: [], tokenMetadata: [] }
    }

    const fetchPools = async (mint: string) => {
        if (!connection) return

        if (fetchingPools) return;
        setFetchingPools(true)
        try {
            const pools = await cpAmm._program.account.pool.all([{
                memcmp: {
                    encoding: 'base58',
                    offset: 168,
                    bytes: mint,
                }
            }])
            console.log(pools.length);

            await mapPools(pools, GetTokenMetadataMap(fullTokenAccounts));
        } finally {
            setFetchingPools(false);
        }
    }

    const mapPools = async (p: PoolInfo[], tm: TokenMetadataMap) => {
        const detailedPools: PoolDetailedInfo[] = []
        const currentTime = new BN((Date.now())).divn(1000).toNumber();
        for (const x of p) {
            try {
                const withdrawPoolQuote = cpAmm.getWithdrawQuote({
                    liquidityDelta: x.account.liquidity,
                    sqrtPrice: x.account.sqrtPrice,
                    minSqrtPrice: x.account.sqrtMinPrice,
                    maxSqrtPrice: x.account.sqrtMaxPrice,
                })

                const lockedWithdrawPoolQuote = cpAmm.getWithdrawQuote({
                    liquidityDelta: x.account.permanentLockLiquidity,
                    sqrtPrice: x.account.sqrtPrice,
                    minSqrtPrice: x.account.sqrtMinPrice,
                    maxSqrtPrice: x.account.sqrtMaxPrice,
                })

                const tokenAMetadata = tm[x.account.tokenAMint.toBase58()];
                const tokenBMetadata = tm[x.account.tokenBMint.toBase58()];

                const poolTokenAAmount = new Decimal(withdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals));
                const poolTokenBAmount = new Decimal(withdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals));

                const poolTokenAAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountA.toString()).div(Decimal.pow(10, tokenAMetadata!.decimals)).toNumber();
                const poolTokenBAmountLocked = new Decimal(lockedWithdrawPoolQuote.outAmountB.toString()).div(Decimal.pow(10, tokenBMetadata!.decimals)).toNumber();

                const poolPrice = new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, tokenAMetadata!.decimals, tokenBMetadata!.decimals));

                const poolTokenA = {
                    ...tokenAMetadata,
                    poolAmount: poolTokenAAmount,
                    totalFeesUsd: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)).mul(tokenAMetadata?.price),
                    totalFeesToken: new Decimal(x.account.metrics.totalLpAFee.add(x.account.metrics.totalProtocolAFee).toString()).div(Decimal.pow(10, tokenAMetadata?.decimals)),
                }

                const poolTokenB = {
                    ...tokenBMetadata,
                    poolAmount: poolTokenBAmount,
                    totalFeesUsd: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)).mul(tokenBMetadata?.price),
                    totalFeesToken: new Decimal(x.account.metrics.totalLpBFee.add(x.account.metrics.totalProtocolBFee).toString()).div(Decimal.pow(10, tokenBMetadata?.decimals)),
                }

                let activationTime = 0;
                if (x.account.activationType === 0) {
                    activationTime = ((getSlot() - x.account.activationPoint.toNumber()) * 400 / 1000);
                } else {
                    activationTime = currentTime - x.account.activationPoint.toNumber();
                }

                detailedPools.push({
                    poolInfo: x,
                    tokenA: poolTokenA,
                    tokenB: poolTokenB,
                    age: activationTime,
                    baseFeeBPS: feeNumeratorToBps(getBaseFeeNumerator(
                        x.account.poolFees.baseFee.feeSchedulerMode,
                        x.account.poolFees.baseFee.cliffFeeNumerator,
                        new BN(x.account.poolFees.baseFee.numberOfPeriod),
                        x.account.poolFees.baseFee.reductionFactor
                    )),
                    totalFeeBPS: feeNumeratorToBps(getFeeNumerator(
                        x.account.activationType === 0 ? getSlot() :
                            x.account.activationType === 1 ? currentTime : 0,
                        x.account.activationPoint,
                        x.account.poolFees.baseFee.numberOfPeriod,
                        x.account.poolFees.baseFee.periodFrequency,
                        x.account.poolFees.baseFee.feeSchedulerMode,
                        x.account.poolFees.baseFee.cliffFeeNumerator,
                        x.account.poolFees.baseFee.reductionFactor,
                        x.account.poolFees.dynamicFee
                    )),
                    price: new Decimal(getPriceFromSqrtPrice(x.account.sqrtPrice, poolTokenA.decimals, poolTokenB.decimals)),
                    TVLUsd: poolPrice.mul(new Decimal(poolTokenAAmount)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmount.mul(tokenBMetadata.price).toNumber(),
                    TVLUsdChange: 0,
                    LiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
                    lockedTVL: poolPrice.mul(new Decimal(poolTokenAAmountLocked)).toNumber() * tokenBMetadata.price.toNumber() + poolTokenBAmountLocked * tokenBMetadata.price.toNumber(),
                    totalFeesUsd: poolTokenA.totalFeesUsd.add(poolTokenB.totalFeesUsd),
                    FeesLiquidityChange: { tokenAAmount: new Decimal(0), tokenBAmount: new Decimal(0) },
                });
            } catch (e) {
                console.error(e)
            }
        };
        const existing = existingPools;
        for (const p of detailedPools)
            existing[p.poolInfo.publicKey.toBase58()] = p;
        setExistingPools(existing);
    };

    const updateTokenAccounts = (tas: (TokenAccount | undefined)[]) => {
        const taTemp = GetTokenAccountMap(allTokenAccounts);
        const currentTime = Date.now();
        for (const ta of tas) {
            console.log(ta)
            if (ta === undefined) continue;
            if (taTemp[ta.mint]) {
                const existing = taTemp[ta.mint];
                existing.amount = ta.amount;
                existing.price = ta.price;
                existing.value = ta.value;
                existing.lastUpdated = currentTime;
            } else
                taTemp[ta.mint] = ta;
        }
        const allTokenAccountsTemp = Object.entries(taTemp).map(x => x[1]);
        setAllTokenAccounts(allTokenAccountsTemp);
        setFullTokenAccounts(allTokenAccountsTemp.filter(x => x.amount.gt(0)));
        setEmptyTokenAccounts(allTokenAccountsTemp.filter(x => x.amount.eq(0)));
    }

    return (
        <TokenAccountsContext.Provider value={{ allTokenAccounts, fullTokenAccounts, emptyTokenAccounts, tokenMetadata, existingPools, solBalance, loading, refreshTokenAccounts, fetchPools, updateTokenAccounts }}>
            {children}
        </TokenAccountsContext.Provider>
    )
}
