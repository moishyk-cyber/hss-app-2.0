"use client";

import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { fmtUSD, formatMoneyDraft, parseMoney } from "./money";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "min" | "step"> & {
  value?: string | number;
  defaultValue?: string | number;
  min?: string | number;
  onValueChange?: (value: string) => void;
};

function rawMoney(value: string | number): string {
  return String(value).replace(/[$,\s]/g, "");
}

/** Format as you type, and submit plain numbers to every action. */
export function MoneyInput({
  value, defaultValue = "", onValueChange, name, min = 0,
  onFocus, onBlur, className, placeholder = "$0.00", disabled, ...props
}: Props) {
  const [draft, setDraft] = useState(() => ({ raw: rawMoney(defaultValue) }));
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const raw = value === undefined ? draft.raw : rawMoney(value);
  const amount = parseMoney(raw);
  const display = !focused && amount != null && Number.isFinite(amount)
    ? fmtUSD(amount, { cents: true }) : formatMoneyDraft(raw);

  useLayoutEffect(() => {
    if (caret.current == null || !input.current) return;
    // Count digits/decimal before the cursor, then find that position again
    // after adding the currency symbol and thousands separators.
    let position = display.startsWith("$") ? 1 : 0;
    let remaining = caret.current;
    while (position < display.length && remaining > 0) {
      if (!/[$,]/.test(display[position])) remaining--;
      position++;
    }
    input.current.setSelectionRange(position, position);
    caret.current = null;
  });

  function validate(element: HTMLInputElement, next: string) {
    const parsed = parseMoney(next);
    element.setCustomValidity(parsed != null && (!Number.isFinite(parsed) || parsed < Number(min))
      ? `Enter an amount of at least ${fmtUSD(Number(min), { cents: true })}.` : "");
  }

  useEffect(() => {
    if (input.current) validate(input.current, raw);
  }, [raw, min]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const form = input.current?.form;
    function reset() {
      if (value === undefined) setDraft({ raw: rawMoney(defaultValue) });
      setFocused(false);
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  function update(next: string) {
    // A new object also rerenders when deleting only a separator, so the
    // formatted value and cursor are restored even if the number is unchanged.
    setDraft({ raw: next });
    // Blur can submit immediately, before React has rendered the new value.
    if (submitted.current) submitted.current.value = next;
    onValueChange?.(next);
  }

  return (
    <>
      <input
        {...props}
        ref={input}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        className={`${className ?? "input-klyne"} tabular-nums`}
        value={display}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onChange={(event) => {
          caret.current = rawMoney(event.currentTarget.value.slice(0, event.currentTarget.selectionStart ?? 0)).length;
          const next = rawMoney(event.currentTarget.value);
          validate(event.currentTarget, next);
          update(next);
        }}
        onBlur={(event) => {
          const next = rawMoney(event.currentTarget.value);
          validate(event.currentTarget, next);
          update(next);
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {name && <input ref={submitted} type="hidden" name={name} value={raw} disabled={disabled} />}
    </>
  );
}
