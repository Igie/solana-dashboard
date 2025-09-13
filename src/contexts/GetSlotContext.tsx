import React, { createContext, useContext, useEffect, useRef, } from 'react'
import { useConnection } from '@jup-ag/wallet-adapter'

interface GetSlotContextType {
    getSlot: () => number
}

const GetSlotContext = createContext<GetSlotContextType>({
    getSlot: () => { return 0 }
})

export const useGetSlot = () => useContext(GetSlotContext)

export const GetSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { connection } = useConnection();

    const slotRef = useRef(0);

    const getSlot = () => {
        return slotRef.current;
    }

    useEffect(() => {
        if (!connection) return;
        const slotChangeId = connection.onSlotChange((x) => {
            slotRef.current = x.slot;
        })

        return () => {
            connection.removeSlotChangeListener(slotChangeId);
        }
    }, [connection]);

    return (
        <GetSlotContext.Provider value={{ getSlot }}>
            {children}
        </GetSlotContext.Provider>
    )
}
