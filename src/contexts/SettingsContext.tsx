import React, { createContext, useContext, useEffect, useState, } from 'react'
import Cookies from 'js-cookie'

interface SettingsContextType {
    jupSlippage: number | undefined,
    setJupSlippage: (s: number) => void,

    jupZapOutSlippage: number | undefined,
    setJupZapOutSlippage: (s: number) => void,

    includeDammv2Route: boolean | undefined,
    setIncludeDammv2Route: (v: boolean) => void,
}

const SettingsContext = createContext<SettingsContextType>({
    jupSlippage: undefined,
    setJupSlippage: () => { },
    jupZapOutSlippage: undefined,
    setJupZapOutSlippage: () => { },
    includeDammv2Route: undefined,
    setIncludeDammv2Route: () => { },
});

export const useSettings = () => useContext(SettingsContext)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

    const [jupSlippage, setJupSlippage] = useState<number | undefined>(Cookies.get("jup-slippage") ? parseFloat(Cookies.get("jup-slippage")!) : undefined);
    const [jupZapOutSlippage, setJupZapOutSlippage] = useState<number | undefined>(Cookies.get("jup-zapout-slippage") ? parseFloat(Cookies.get("jup-zapout-slippage")!) : undefined);
    const [includeDammv2Route, setIncludeDammv2Route] = useState<boolean | undefined>(Cookies.get("include-dammv2-route") ? (Cookies.get("include-dammv2-route") === "true") : undefined);

    useEffect(() => {
        if (jupSlippage && jupSlippage.toString() !== Cookies.get("jup-slippage")) {
            Cookies.set("jup-slippage", jupSlippage.toString());
            console.log("Set jup-slippage cookie to ", jupSlippage);
        }
    }, [jupSlippage])

    useEffect(() => {
        if (jupZapOutSlippage && jupZapOutSlippage.toString() !== Cookies.get("jup-zapout-slippage")) {
            Cookies.set("jup-zapout-slippage", jupZapOutSlippage.toString());
            console.log("Set jup-zapout-slippage cookie to ", jupZapOutSlippage);
        }
    }, [jupZapOutSlippage])

    useEffect(() => {
        if (includeDammv2Route !== undefined && includeDammv2Route !== (Cookies.get("include-dammv2-route") === "true")) {
            Cookies.set("include-dammv2-route", includeDammv2Route ? "true" : "false");
            console.log("Set include-dammv2-route cookie to ", includeDammv2Route);
        }
    }, [includeDammv2Route])

    useEffect(() => {
        if (!jupSlippage) {
            setJupSlippage(2);
        }
        if (!jupZapOutSlippage) {
            setJupZapOutSlippage(100);
        }
        if (includeDammv2Route === undefined) {
            setIncludeDammv2Route(true);
        }
    }, [])

    return (
        <SettingsContext.Provider value={{
            jupSlippage, setJupSlippage,
            jupZapOutSlippage, setJupZapOutSlippage,
            includeDammv2Route, setIncludeDammv2Route
        }}>
            {children}
        </SettingsContext.Provider>
    )
}
