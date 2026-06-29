// The model registry: id -> runnable descriptor. Built by the caller (CLI) from
// real adapters; the router selects from it. Also computes the "always-frontier"
// baseline used by the distribution report.

import type { StreamingAdapter, Usage } from '@glamfire/engine';
import type { ModelDescriptor } from './types.js';

/**
 * Build a {@link ModelDescriptor} from a real adapter + runtime config. The
 * descriptor's id is the *model* id (`config.model`), since that is what the
 * routing policy's candidate lists reference (not the adapter id).
 */
export function descriptorFromAdapter(
  adapter: StreamingAdapter,
  config: ModelDescriptor['config'],
): ModelDescriptor {
  return {
    id: config.model,
    adapter,
    config,
    capabilities: adapter.capabilities,
    pricing: (usage: Usage) => adapter.pricing(usage),
  };
}

/** An ordered, id-keyed set of runnable models the router may select from. */
export class ModelRegistry {
  private readonly byId = new Map<string, ModelDescriptor>();

  add(descriptor: ModelDescriptor): this {
    this.byId.set(descriptor.id, descriptor);
    return this;
  }

  /** Convenience: register a model straight from a real adapter + config. */
  addAdapter(adapter: StreamingAdapter, config: ModelDescriptor['config']): this {
    return this.add(descriptorFromAdapter(adapter, config));
  }

  get(id: string): ModelDescriptor | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  all(): ModelDescriptor[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  /**
   * The most expensive registered model for a given usage estimate — the
   * "always send everything to the frontier" baseline the cost report compares
   * routing against. Returns undefined for an empty registry.
   */
  frontier(usage: Usage): ModelDescriptor | undefined {
    let best: ModelDescriptor | undefined;
    let bestCost = -1;
    for (const d of this.byId.values()) {
      const cost = d.pricing(usage);
      if (cost > bestCost) {
        bestCost = cost;
        best = d;
      }
    }
    return best;
  }
}
