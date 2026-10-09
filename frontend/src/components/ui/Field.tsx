import { useId, useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle transition-colors focus:border-brand-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400 disabled:bg-neutral-soft disabled:text-muted';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function TextInput({ invalid, className, ...rest }: TextInputProps) {
  return (
    <input
      className={cn(CONTROL, 'h-10', invalid && 'border-danger-line bg-danger-soft/40', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function TextArea({
  invalid,
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL, 'py-2 leading-6', invalid && 'border-danger-line bg-danger-soft/40', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ options, placeholder, invalid, className, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        CONTROL,
        'h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9',
        invalid && 'border-danger-line bg-danger-soft/40',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5 12 6.5'/%3E%3C/svg%3E\")",
      }}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search the list',
  invalid,
  id,
  disabled,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle));
  }, [options, query]);
  return (
    <div className="space-y-1">
      <input
        id={id}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(CONTROL, 'h-10', invalid && 'border-danger-line')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const exact = options.find(
            (option) => option.label.toLowerCase() === query.trim().toLowerCase() || option.value === query.trim(),
          );
          if (exact) onChange(exact.value);
        }}
      />
      <select
        value={options.some((option) => option.value === value) ? value : ''}
        disabled={disabled}
        className={cn(CONTROL, 'h-10', invalid && 'border-danger-line')}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{filtered.length === 0 ? 'No matches' : 'Select'}</option>
        {filtered.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={rest.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line text-brand-500 accent-brand-500"
        {...rest}
      />
      <label htmlFor={rest.id ?? id} className="cursor-pointer text-[13px] leading-5 text-ink">
        {label}
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export function RadioCard({
  label,
  description,
  checked,
  onSelect,
  name,
  icon,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onSelect: () => void;
  name: string;
  icon?: ReactNode;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked ? 'border-brand-400 bg-info-soft' : 'border-line bg-surface hover:border-brand-200',
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-500"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {icon}
          {label}
        </span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
