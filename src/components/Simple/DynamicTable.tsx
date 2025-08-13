import React from "react";

export type Column<T> = {
    header: React.ReactNode;
    render: (row: T, rowIndex: number) => React.ReactNode;
    className?: string; // Optional: column-specific styles
};

type TableProps<T> = {
    data: T[];
    columns: Column<T>[];
    tableClassName?: string; // Applies to <table>
    rowClassName?: (row: T, index: number) => string; // Row-level styling
};

export function DynamicTable<T>({
    data,
    columns,
    tableClassName = "",
    rowClassName,
}: TableProps<T>) {
    return (
        <table className={`w-full border-collapse ${tableClassName}`}>
            <thead>
                <tr>
                    {columns.map((col, colIndex) => (
                        <th
                            key={colIndex}
                            className={`px-2 py-1 border-b border-gray-700 text-center font-semibold ${col.className ?? ""}`}
                        >
                            {col.header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {data.map((row, rowIndex) => (
                    <tr
                        key={rowIndex}
                        className={rowClassName ? rowClassName(row, rowIndex) : ""}
                    >
                        {columns.map((col, colIndex) => (
                            <td
                                key={colIndex}
                                className={`px-2 py-1 border-b border-gray-700 ${col.className ?? ""}`}
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