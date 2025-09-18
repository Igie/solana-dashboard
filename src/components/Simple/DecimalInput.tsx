import React, { useEffect, useState } from 'react';
import Decimal from 'decimal.js';

interface DecimalInputProps {
  value: string;
  onChange: (val: string) => void; // still string so user can freely type
  onBlur?: (val: Decimal) => void;
  placeholder?: string;
  className?: string;
}

export const DecimalInput: React.FC<DecimalInputProps> = ({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    if (/^[0-9]*\.?[0-9]*$/.test(val)) {
      setLocalValue(val);
      onChange(val);
    }
  };

  const handleBlur = () => {
    try {
      const parsed = new Decimal(localValue);
      setLocalValue(parsed.toString());
      onChange(parsed.toString());
      onBlur?.(parsed);
    } catch {
      setLocalValue('');
      onChange('');
      onBlur?.(new Decimal(0));
    }
  };

  return (
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
  );
};
