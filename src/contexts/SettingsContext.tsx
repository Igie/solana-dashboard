import React, { createContext, useContext, useEffect, useState, } from 'react'
import Cookies from 'js-cookie'

interface SettingsContextType {
    jupSlippage: number | undefined,
    setJupSlippage: (s: number) => void,

    jupZapOutSlippage: number | undefined,
    setJupZapOutSlippage: (s: number) => void,

    includeDammv2Route: boolean | undefined,
    setIncludeDammv2Route: (v: boolean) => void,

    swapSolDefaultAmount: number | undefined,
    setSwapSolDefaultAmount: (s: number) => void,
}

const SettingsContext = createContext<SettingsContextType>({
    jupSlippage: undefined,
    setJupSlippage: () => { },
    jupZapOutSlippage: undefined,
    setJupZapOutSlippage: () => { },
    includeDammv2Route: undefined,
    setIncludeDammv2Route: () => { },
    swapSolDefaultAmount: undefined,
    setSwapSolDefaultAmount: () => { },
});

export const useSettings = () => useContext(SettingsContext)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

    const [jupSlippage, setJupSlippage] = useState<number | undefined>(Cookies.get("jup-slippage") ? parseFloat(Cookies.get("jup-slippage")!) : undefined);
    const [jupZapOutSlippage, setJupZapOutSlippage] = useState<number | undefined>(Cookies.get("jup-zapout-slippage") ? parseFloat(Cookies.get("jup-zapout-slippage")!) : undefined);
    const [includeDammv2Route, setIncludeDammv2Route] = useState<boolean | undefined>(Cookies.get("include-dammv2-route") ? (Cookies.get("include-dammv2-route") === "true") : undefined);
    const [swapSolDefaultAmount, setSwapSolDefaultAmount] = useState<number | undefined>(Cookies.get("swap-sol-default-amount") ? parseFloat(Cookies.get("swap-sol-default-amount")!) : undefined);
    useEffect(() => {
        if (jupSlippage !== undefined) {
            Cookies.set("jup-slippage", jupSlippage.toString(), { expires: new Date(Date.now() + 604800000) });
            console.log("Set jup-slippage cookie to ", jupSlippage);
        }
    }, [jupSlippage])

    useEffect(() => {
        if (jupZapOutSlippage !== undefined) {
            Cookies.set("jup-zapout-slippage", jupZapOutSlippage.toString(), { expires: new Date(Date.now() + 604800000) });
            console.log("Set jup-zapout-slippage cookie to ", jupZapOutSlippage);
        }
    }, [jupZapOutSlippage])

    useEffect(() => {
        if (includeDammv2Route !== undefined) {
            Cookies.set("include-dammv2-route", includeDammv2Route ? "true" : "false", { expires: new Date(Date.now() + 604800000) });
            console.log("Set include-dammv2-route cookie to ", includeDammv2Route);
        }
    }, [includeDammv2Route])

    useEffect(() => {
        if (swapSolDefaultAmount !== undefined) {
            Cookies.set("swap-sol-default-amount", swapSolDefaultAmount.toString(), { expires: new Date(Date.now() + 604800000) });
            console.log("Set swap-sol-default-amount cookie to ", swapSolDefaultAmount);
        }
    }, [swapSolDefaultAmount])



    useEffect(() => {
        if (jupSlippage === undefined) {
            setJupSlippage(2);
        } else
            setJupSlippage(jupSlippage)

        if (jupZapOutSlippage === undefined) {
            setJupZapOutSlippage(100);
        } else
            setJupZapOutSlippage(jupZapOutSlippage)
        if (includeDammv2Route === undefined) {
            setIncludeDammv2Route(true);
        } else
            setIncludeDammv2Route(includeDammv2Route)

        if (swapSolDefaultAmount === undefined) {
            setSwapSolDefaultAmount(0.01);
        } else
            setSwapSolDefaultAmount(swapSolDefaultAmount);
    }, [])

    return (
        <SettingsContext.Provider value={{
            jupSlippage, setJupSlippage,
            jupZapOutSlippage, setJupZapOutSlippage,
            includeDammv2Route, setIncludeDammv2Route,
            swapSolDefaultAmount, setSwapSolDefaultAmount,
        }}>
            {children}
        </SettingsContext.Provider>
    )
}
