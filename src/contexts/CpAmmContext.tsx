import React, { createContext, useContext, useEffect } from 'react'
import { useConnection } from '@jup-ag/wallet-adapter'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'

interface CpAmmContextType {
    cpAmm: CpAmm
}

const CpAmmContext = createContext<CpAmmContextType>({
    cpAmm: new CpAmm(null as any) // will be overwritten in provider,
})

export const useCpAmm = () => useContext(CpAmmContext)

export const CpAmmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { connection } = useConnection()

    let cpAmm = new CpAmm(connection);

    useEffect(() => {
        cpAmm = new CpAmm(connection)
    }, [connection]);


    return (
        <CpAmmContext.Provider value={{ cpAmm }}>
            {children}
        </CpAmmContext.Provider>
    )
}
