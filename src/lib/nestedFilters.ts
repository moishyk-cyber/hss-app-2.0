import type { ListField } from "./listQuery";

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "before"
  | "after"
  | "gte"
  | "lte";
export type FilterCondition = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
};
export type FilterGroup = {
  id: string;
  logic: "AND" | "OR";
  children: FilterNode[];
};
export type FilterNode = FilterCondition | FilterGroup;
export const EMPTY_FILTERS: FilterGroup = {
  id: "root",
  logic: "AND",
  children: [],
};
const OPERATORS = new Set([
  "is",
  "is_not",
  "contains",
  "not_contains",
  "before",
  "after",
  "gte",
  "lte",
]);

/** A bounded, validated tree. Only declared collection fields reach a query. */
export function readFilterTree(
  raw: unknown,
  fields: readonly ListField[],
): FilterGroup {
  if (typeof raw !== "string" || raw.length > 16000) return EMPTY_FILTERS;
  let count = 0;
  function read(input: unknown, depth: number): FilterNode | null {
    if (!input || typeof input !== "object" || depth > 4 || ++count > 48)
      return null;
    const node = input as Record<string, unknown>;
    const id =
      typeof node.id === "string" ? node.id.slice(0, 64) : `filter-${count}`;
    if (node.logic === "AND" || node.logic === "OR") {
      if (!Array.isArray(node.children)) return null;
      return {
        id,
        logic: node.logic,
        children: node.children
          .map((child) => read(child, depth + 1))
          .filter((child): child is FilterNode => !!child),
      };
    }
    const field = fields.find(
      (field) => field.key === node.field && field.filterable !== false,
    );
    if (
      !field ||
      typeof node.value !== "string" ||
      node.value.length > 500 ||
      !OPERATORS.has(String(node.operator))
    )
      return null;
    const operator = node.operator as FilterOperator;
    if (field.type === "enum" && !["is", "is_not"].includes(operator))
      return null;
    if (
      field.type === "text" &&
      !["is", "is_not", "contains", "not_contains"].includes(operator)
    )
      return null;
    if (
      ["number", "date"].includes(field.type) &&
      ["contains", "not_contains"].includes(operator)
    )
      return null;
    return { id, field: field.key, operator, value: node.value };
  }
  try {
    const tree = read(JSON.parse(raw), 0);
    return tree && "children" in tree ? tree : EMPTY_FILTERS;
  } catch {
    return EMPTY_FILTERS;
  }
}
export function validFilterValue(field: ListField, value: string) {
  if (!value) return false;
  if (field.type === "enum")
    return !!field.options?.some((option) => option.value === value);
  if (field.type === "date")
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  if (field.type === "number") return Number.isFinite(Number(value));
  return true;
}
export type FilterBinding =
  | string
  | ((condition: FilterCondition) => Record<string, unknown>);
function nest(path: string, value: unknown): Record<string, unknown> {
  return path
    .split(".")
    .reverse()
    .reduce<Record<string, unknown>>(
      (result, key, index) => ({ [key]: index === 0 ? value : result }),
      {},
    );
}
export function compileFilterTree<T>(
  fields: readonly ListField[],
  raw: unknown,
  bindings: Record<string, FilterBinding>,
): T | undefined {
  const tree = readFilterTree(raw, fields);
  function compile(node: FilterNode): Record<string, unknown> | undefined {
    if ("children" in node) {
      const children = node.children
        .map(compile)
        .filter((child): child is Record<string, unknown> => !!child);
      return children.length ? { [node.logic]: children } : undefined;
    }
    const field = fields.find((field) => field.key === node.field);
    const binding = Object.hasOwn(bindings, node.field)
      ? bindings[node.field]
      : undefined;
    if (!field || !binding || !validFilterValue(field, node.value))
      return undefined;
    let query: Record<string, unknown>;
    if (typeof binding === "function") query = binding(node);
    else {
      let value: unknown = node.value;
      if (field.type === "text")
        value = {
          [node.operator.includes("contains") ? "contains" : "equals"]:
            node.value,
          mode: "insensitive",
        };
      else if (field.type === "date") {
        const day = new Date(`${node.value}T00:00:00.000Z`);
        const next = new Date(day.getTime() + 86400000);
        value =
          node.operator === "before"
            ? { lt: day }
            : node.operator === "after"
              ? { gte: next }
              : node.operator === "gte"
                ? { gte: day }
                : node.operator === "lte"
                  ? { lt: next }
                  : { gte: day, lt: next };
      } else if (field.type === "number")
        value = {
          [node.operator === "before"
            ? "lt"
            : node.operator === "after"
              ? "gt"
              : ["gte", "lte"].includes(node.operator)
                ? node.operator
                : "equals"]: Number(node.value),
        };
      else if (node.value === "__unassigned__") value = null;
      query = nest(binding, value);
    }
    return ["is_not", "not_contains"].includes(node.operator)
      ? { NOT: query }
      : query;
  }
  return compile(tree) as T | undefined;
}
export function matchFilterTree(
  fields: readonly ListField[],
  raw: unknown,
  values: Record<string, string | null>,
): boolean {
  function match(node: FilterNode): boolean | undefined {
    if ("children" in node) {
      const results = node.children
        .map(match)
        .filter((value): value is boolean => value !== undefined);
      return results.length
        ? node.logic === "AND"
          ? results.every(Boolean)
          : results.some(Boolean)
        : undefined;
    }
    const field = fields.find((field) => field.key === node.field);
    if (!field || !validFilterValue(field, node.value)) return undefined;
    const value = (values[node.field] ?? "").toLowerCase();
    const target = node.value.toLowerCase();
    const equal = node.operator.includes("contains")
      ? value.includes(target)
      : value === target;
    return ["is_not", "not_contains"].includes(node.operator) ? !equal : equal;
  }
  return match(readFilterTree(raw, fields)) ?? true;
}
