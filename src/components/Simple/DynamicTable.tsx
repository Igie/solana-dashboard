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
    <div className="flex justify-center">
      <div className="flex-grow overflow-auto max-h-[calc(100vh)] max-w-[calc(95vw)]">
        <table className={`border-collapse table-auto ${tableClassName}`}>
          {(hideHeaders === false || hideHeaders === undefined) && (
            <thead
              className="sticky -top-0.5"
            >
              <tr>
                {columns.map((col, colIndex) => (
                  <th
                    key={colIndex}
                    className={`lg:px-4 px-1 py-0.5 border text-xs border-gray-700 bg-gray-800 lg:font-semibold font-normal text-nowrap ${col.className ?? ""}`}
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
                    className={`lg:px-4 px-1 py-0.5 border border-gray-700 text-xs lg:text-md text-nowrap ${col.className ?? ""}`}
                  >
                    {col.render(row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
