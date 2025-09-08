import React, { createContext, useContext, useEffect, } from 'react'
import { useConnection } from '@jup-ag/wallet-adapter'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { Zap } from "@meteora-ag/zap-sdk";
interface CpAmmContextType {
    cpAmm: CpAmm
    zap: Zap
}

const CpAmmContext = createContext<CpAmmContextType>({
    cpAmm: new CpAmm(null as any),
    zap: new Zap(null as any),
})

export const useCpAmm = () => useContext(CpAmmContext)

export const CpAmmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { connection } = useConnection();
    let cpAmm = new CpAmm(connection);
    let zap = new Zap(connection);
    useEffect(() => {
        cpAmm = new CpAmm(connection);
        zap = new Zap(connection);
        console.log("CpAmmProvider set new connection")
    }, [connection]);

    return (
        <CpAmmContext.Provider value={{ cpAmm, zap }}>
            {children}
        </CpAmmContext.Provider>
    )
}
