import React from "react";

export type Column<T> = {
    header: React.ReactNode;
    render: (row: T, rowIndex: number) => React.ReactNode;
    className?: string;
    hideHeaders?: boolean;
};

type TableProps<T> = {
    data: T[];
    columns: Column<T>[];
    tableClassName?: string;
    rowClassName?: (row: T, index: number) => string;
    hideHeaders: boolean;
};

export function DynamicTable<T>({
    data,
    columns,
    tableClassName = "",
    rowClassName,
    hideHeaders,
}: TableProps<T>) {
    return (
        <table className={`w-full border-collapse ${tableClassName}`}>
            {(hideHeaders === false || hideHeaders === undefined) && (<thead>
                <tr>
                    {columns.map((col, colIndex) => (
                        <th
                            key={colIndex}
                            className={`px-0.5 gap-y-0.5 border-b text-xs text-nowrap flex-nowrap border-gray-700 items-center justify-center font-semibold ${col.className ?? ""}`}
                        >
                            {col.header}
                        </th>
                    ))}
                </tr>
            </thead>)}
            <tbody>
                {data.map((row, rowIndex) => (
                    <tr
                        key={rowIndex}
                        className={rowClassName ? rowClassName(row, rowIndex) : ""}
                    >
                        {columns.map((col, colIndex) => (
                            <td
                                key={colIndex}
                                className={`px-0.5 py-0.5 border-b border-gray-700 text-xs ${col.className ?? ""}`}
                            >
                                {col.render(row, rowIndex)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}