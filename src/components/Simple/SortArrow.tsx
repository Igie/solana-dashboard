import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

export function SortArrow <T>(sortType: T, currentSortType: T, ascending: boolean | undefined, handleSort: (sortType: T, ascending?: boolean) => void) {
    const active = currentSortType === sortType;
    const baseStyle = 'w-4 h-3 text-gray-400';
    if (!active || ascending === undefined) {
        return (
            <button onClick={() => handleSort(sortType, true)}>
                <ArrowUpDown className={baseStyle} />
            </button>
        );
    }

    if (ascending === true) {
        return (
            <button onClick={() => handleSort(sortType, false)}>
                <ChevronUp className={`${baseStyle} text-white`} />
            </button>
        );
    }

    if (ascending === false) {
        return (
            <button onClick={() => handleSort(sortType, undefined)}>
                <ChevronDown className={`${baseStyle} text-white`} />
            </button>
        );
    }
}