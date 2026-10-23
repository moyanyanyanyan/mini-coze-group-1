import { useId } from 'react';
import styles from '../auth.module.css';

interface AuthFieldProps {
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  onChange: (value: string) => void;
}

export function AuthField({
  label,
  type,
  value,
  placeholder,
  autoComplete,
  error,
  onChange,
}: AuthFieldProps) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </div>
  );
}
