import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Menu, RefreshCcw, RefreshCw } from 'lucide-react'


import Dammv2PoolList from './Simple/Dammv2PoolList'

import { launchpads } from './launchpads/Launchpads'
import { useDammV2PoolsWebsocket } from '../contexts/Dammv2PoolContext'

const MainPoolFilters = ["Include", "Exclude", "Only"];

const Dammv2Browser: React.FC = () => {
    const {
        update, setUpdate, fetchAllPools, fetchingPools,
        filteredDetailedPools, tokenMetadataMap,
        creatorAddressFilter, setCreatorAddressFilter,
        mainPoolFilter, setMainPoolFilter,
        poolAddressOrMintFilter, setPoolAddressOrMintFilter,
        launchpadFilter, setLaunchpadFilter,
        setPoolSorting
    }
        = useDammV2PoolsWebsocket();

    const [localCreatorAddressFilter, setLocalCreatorAddressFilter] = useState(creatorAddressFilter);
    const [localPoolAddressOrMintFilter, setLocalPoolAddressOrMintFilter] = useState(poolAddressOrMintFilter);

    const [showlaunchpadSelector, setShowLaunchpadSelector] = useState(false);

    return (
        <div className="flex flex-col h-[calc(100vh-110px)] lg:h-[calc(100vh-55px)] space-y-1 px-2 md:px-0">
            {/* Header */}
            <div className="flex md:grid justify-start items-stretch gap-1">
                <button
                    onClick={() => fetchAllPools(undefined)}
                    disabled={fetchingPools}
                    className="flex items-center gap-1 px-2 w-full lg:max-w-40 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-md md:text-sm transition-colors"
                >
                    {fetchingPools ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    {fetchingPools ? (
                        "Refreshing..."
                    ) : (
                        "Refresh"
                    )}
                </button>
                <label className='flex items-center gap-1 px-2 w-full lg:max-w-40 bg-purple-600 hover:bg-purple-700 rounded-md md:text-sm transition-colors'>
                    <input type='checkbox'
                        checked={update}
                        onChange={(e) => setUpdate(e.target.checked)}>
                    </input>
                    Auto Refresh
                </label>
            </div>

            <div className='grid grid-cols-2 gap-1'>
                <div className="relative w-full">
                    <label className="block text-sm text-gray-400">Pool/mint address</label>
                    <div className="flex" >
                        <button
                            type="button"
                            onClick={() => setPoolAddressOrMintFilter(localPoolAddressOrMintFilter)}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Refresh pools"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        <input
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm placeholder-gray-500"
                            placeholder="Pool/mint address..."
                            value={localPoolAddressOrMintFilter}
                            onChange={e => {
                                setLocalPoolAddressOrMintFilter(e.target.value.trim())
                                if (e.target.value.trim() == "")
                                    setPoolAddressOrMintFilter("");
                            }}
                            onKeyDown={async e => {
                                if (e.ctrlKey && e.key == "v") {
                                    setPoolAddressOrMintFilter(await navigator.clipboard.readText())
                                }
                            }}
                        />
                    </div>
                </div>


                <div className="relative w-full">
                    <label className="block text-sm text-gray-400">Creator address</label>
                    <div className="flex" >
                        <button
                            type="button"
                            //onClick={() => fetchPools()}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Refresh pools"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                        <input
                            className="w-full bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm placeholder-gray-500"
                            placeholder="Creator address..."
                            value={localCreatorAddressFilter}
                            onChange={e => {
                                setLocalCreatorAddressFilter(e.target.value.trim());
                                if (e.target.value.trim() == "")
                                    setCreatorAddressFilter("");
                            }}
                            onKeyDown={async e => {
                                if (e.ctrlKey && e.key == "v") {
                                    setCreatorAddressFilter(await navigator.clipboard.readText())
                                }
                            }}
                        />
                    </div>
                </div>

            </div>
            <div className='grid md:grid-cols-2 lg:grid-cols-4 gap-1'>

                <div className="relative w-full">
                    <div className="grid grid-cols-2" >
                        <button
                            type="button"
                            onClick={() => {
                                setMainPoolFilter(MainPoolFilters[(MainPoolFilters.indexOf(mainPoolFilter)! + 1) % 3]);
                            }}
                            className="flex items-center justify-center px-2 bg-gray-700 border border-gray-600 rounded-l-md md:text-sm hover:bg-gray-600 text-white"
                            title="Main Pool < 10% current fee"
                        >
                            {mainPoolFilter.toString()}
                        </button>
                        <div
                            className="bg-gray-800 border-t border-b border-r border-gray-700 rounded-r-md px-2 py-0.5 text-white md:text-sm"
                        >
                            Main Pools
                        </div>
                    </div>
                </div>
                <div className="relative w-full">

                    <div className="grid grid-cols-2" >
                        <div className='flex flex-col'>
                            <button
                                onClick={() => setShowLaunchpadSelector(!showlaunchpadSelector)}
                                className="flex items-center justify-center px-2 py-0.5 bg-gray-700 border border-gray-600 rounded-md md:text-sm hover:bg-gray-600 text-white"
                            >
                                <Menu className="w-4 h-4" />
                                Launchpads
                                {showlaunchpadSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {showlaunchpadSelector &&
                                <div className="overflow-y-auto max-h-[40vh] lg:max-h-[70vh] absolute top-6 bg-gray-800 border border-gray-600 rounded-lg p-2 z-10 shadow-lg">

                                    {Object.entries(launchpads).map((x, i) => (
                                        <div key={i} className='flex'>

                                            <label
                                                onClick={() => { }}
                                                className={`flex w-full text-left px-2 py-1 gap-1 text-white hover:bg-gray-700 rounded text-sm`}
                                            >
                                                <input
                                                    type='checkbox'
                                                    checked={launchpadFilter.has(x[0])}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setLaunchpadFilter(new Set(launchpadFilter.add(x[0])));
                                                        }
                                                        if (!e.target.checked) {
                                                            const array = Array.from(launchpadFilter);
                                                            const itemIndex = array.indexOf(x[0]);
                                                            if (itemIndex >= 0) {
                                                                array.splice(itemIndex, 1)
                                                                setLaunchpadFilter(new Set<string>(array));
                                                            }
                                                        }
                                                    }}
                                                >
                                                </input>
                                                <div className="max-w-4 max-h-4 object-scale-down">
                                                    {
                                                        (() => {
                                                            const Launchpad = x[1].logo;

                                                            return <Launchpad />;
                                                        }
                                                        )()
                                                    }
                                                </div>
                                                <div className="">{x[0]}</div>
                                            </label>
                                        </div>
                                    ))}
                                </div>}
                        </div>
                    </div>
                </div>
            </div>
            {/* {fetchingPools && (
                <div className="text-sm text-gray-400">Searching for pools...</div>
            )} */}

            {/* {!fetchingPools && pools.length === 0 && (
                <div className="text-sm text-gray-500">No DAMMv2 pools found.</div>
            )} */}
            <Dammv2PoolList
                pools={filteredDetailedPools}
                tokenMetadataMap={tokenMetadataMap}
                sortParamsCallback={(sortType, ascending) => {
                    setPoolSorting({ type: sortType, ascending })
                }} />
        </div>
    )
}
export default Dammv2Browser