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
  hideHeaders?: boolean;
};

export function DynamicTable<T>({
  data,
  columns,
  tableClassName = "",
  rowClassName,
  hideHeaders,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className={`border-collapse table-auto ${tableClassName}`}>
        {(hideHeaders === false || hideHeaders === undefined) && (
          <thead>
            <tr>
              {columns.map((col, colIndex) => (
                <th
                  key={colIndex}
                  className={`px-5 py-0.5 border text-xs border-gray-700 font-semibold text-nowrap ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={rowClassName ? rowClassName(row, rowIndex) : "" + " hover:bg-gray-800/50"}
            >
              {columns.map((col, colIndex) => (
                <td
                  key={colIndex}
                  className={`px-5 py-0.5 border border-gray-700 text-md text-nowrap ${col.className ?? ""}`}
                >
                  {col.render(row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
