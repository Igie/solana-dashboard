import React, { useEffect, useState } from 'react';

interface NumberInputProps {
  value: string;
  onChange: (val: string) => void; // still string so user can freely type
  onBlur?: (val: number) => void;
  placeholder?: string;
  className?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
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

    if (/^[0-9]+$/.test(val)) {
      setLocalValue(val);
      onChange(val);
    }
  };

  const handleBlur = () => {
    try {
      const parsed = parseInt(localValue);
      setLocalValue(parsed.toString());
      onChange(parsed.toString());
      onBlur?.(parsed);
    } catch {
      setLocalValue('');
      onChange('');
      onBlur?.(0);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};
