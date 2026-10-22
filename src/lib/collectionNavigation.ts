/** Compose controls against the latest intent while a server navigation is pending. */
export class CollectionQueryIntent {
  private pending: { path: string; query: string; known: Set<string> } | null = null;

  reset() { this.pending = null; }

  read(path: string, committed: string): URLSearchParams {
    const query = new URLSearchParams(committed).toString();
    const pending = this.pending;
    if (pending && (pending.path !== path || !pending.known.has(query))) this.reset();
    else if (pending?.query === query) this.reset();
    return new URLSearchParams(this.pending?.query ?? query);
  }

  stage(path: string, committed: string, mutate: (query: URLSearchParams) => void): URLSearchParams {
    const query = this.read(path, committed);
    mutate(query);
    const next = query.toString();
    const known = this.pending?.known ?? new Set([new URLSearchParams(committed).toString()]);
    known.add(next);
    this.pending = { path, query: next, known };
    return query;
  }
}

const intent = new CollectionQueryIntent();
if (typeof window !== "undefined") window.addEventListener("popstate", () => intent.reset());

export function collectionQuery() {
  return intent.read(window.location.pathname, window.location.search);
}

export function stageCollectionQuery(mutate: (query: URLSearchParams) => void) {
  return intent.stage(window.location.pathname, window.location.search, mutate);
}

export function collectionHref(query: URLSearchParams, path = window.location.pathname) {
  return query.size ? `${path}?${query}` : path;
}
