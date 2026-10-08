"use client";
import { useEffect, useRef, useState } from "react";
import type { ListField } from "./listQuery";
import {
  type FilterNode,
  type FilterGroup,
  type FilterCondition,
  type FilterOperator,
} from "./nestedFilters";

function ValueInput({
  condition,
  field,
  onChange,
}: {
  condition: FilterCondition;
  field: ListField;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(condition.value);
  const [previous, setPrevious] = useState(condition.value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  if (previous !== condition.value) {
    setPrevious(condition.value);
    setValue(condition.value);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (field.type === "enum")
    return (
      <select
        className="input-klyne"
        aria-label={`${field.label} filter value`}
        value={condition.value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Any</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  return (
    <input
      className="input-klyne"
      aria-label={`${field.label} filter value`}
      type={field.type === "text" ? "text" : field.type}
      value={value}
      placeholder="Value…"
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => change.current(next), 300);
      }}
    />
  );
}
function AddFilter({
  fields,
  onAdd,
  onGroup,
  depth,
}: {
  fields: readonly ListField[];
  onAdd: (field: ListField) => void;
  onGroup: () => void;
  depth: number;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        ref.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={ref} className="add-filter-menu">
      <summary className="add-filter">＋ Add filter</summary>
      <div
        className="add-filter-options"
        role="group"
        aria-label="Choose filter field"
      >
        {fields
          .filter((field) => field.filterable !== false)
          .map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => {
                onAdd(field);
                if (ref.current) ref.current.open = false;
              }}
            >
              {field.label}
            </button>
          ))}
        {depth < 3 && (
          <button
            type="button"
            className="add-group-option"
            onClick={() => {
              onGroup();
              if (ref.current) ref.current.open = false;
            }}
          >
            ＋ Nested group
          </button>
        )}
      </div>
    </details>
  );
}
export function FilterBuilder({
  tree,
  fields,
  onChange,
}: {
  tree: FilterGroup;
  fields: readonly ListField[];
  onChange: (
    path: number[],
    update: (node: FilterNode) => FilterNode | null,
  ) => void;
}) {
  function group(node: FilterGroup, path: number[], depth: number) {
    const add = (child: FilterNode) =>
      onChange(path, (current) =>
        "children" in current
          ? { ...current, children: [...current.children, child] }
          : current,
      );
    return (
      <div
        className={depth ? "nested-filter-group" : "independent-filters"}
        key={node.id}
      >
        {(node.children.length > 1 || depth > 0) && (
          <select
            className="input-klyne filter-logic"
            aria-label={
              depth ? `Group ${depth} match logic` : "Filter match logic"
            }
            value={node.logic}
            onChange={(e) =>
              onChange(path, (current) =>
                "children" in current
                  ? { ...current, logic: e.target.value as "AND" | "OR" }
                  : current,
              )
            }
          >
            <option value="AND">All of</option>
            <option value="OR">Any of</option>
          </select>
        )}
        {node.children.map((child, index) => {
          const childPath = [...path, index];
          if ("children" in child) return group(child, childPath, depth + 1);
          const field = fields.find((field) => field.key === child.field);
          if (!field) return null;
          const operators =
            field.type === "text"
              ? [
                  ["contains", "contains"],
                  ["is", "is"],
                  ["is_not", "is not"],
                  ["not_contains", "doesn't contain"],
                ]
              : field.type === "enum"
                ? [
                    ["is", "is"],
                    ["is_not", "is not"],
                  ]
                : [
                    ["is", "is"],
                    ["is_not", "is not"],
                    ["before", field.type === "date" ? "before" : "less than"],
                    ["after", field.type === "date" ? "after" : "greater than"],
                    ["gte", "at least"],
                    ["lte", "at most"],
                  ];
          return (
            <div className="independent-filter" key={child.id}>
              <span className="filter-name">{field.label}</span>
              <select
        className="input-klyne"
                aria-label={`${field.label} filter operator`}
                value={child.operator}
                onChange={(e) =>
                  onChange(childPath, (current) => ({
                    ...current,
                    operator: e.target.value as FilterOperator,
                  }))
                }
              >
                {operators.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ValueInput
                condition={child}
                field={field}
                onChange={(value) =>
                  onChange(childPath, (current) => ({ ...current, value }))
                }
              />
              <button
                type="button"
                className="remove-filter"
                aria-label={`Remove ${field.label} filter`}
                onClick={() => onChange(childPath, () => null)}
              >
                ×
              </button>
            </div>
          );
        })}
        <AddFilter
          fields={fields}
          depth={depth}
          onAdd={(field) =>
            add({
              id: crypto.randomUUID(),
              field: field.key,
              operator: field.type === "text" ? "contains" : "is",
              value: "",
            })
          }
          onGroup={() =>
            add({ id: crypto.randomUUID(), logic: "AND", children: [] })
          }
        />
        {depth > 0 && (
          <button
            type="button"
            className="remove-filter"
            aria-label="Remove filter group"
            onClick={() => onChange(path, () => null)}
          >
            ×
          </button>
        )}
      </div>
    );
  }
  return group(tree, [], 0);
}
