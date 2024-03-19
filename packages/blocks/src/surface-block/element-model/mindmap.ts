import { DocCollection, type Y } from '@blocksuite/store';

import type { Bound } from '../index.js';
import { type SerializedXYWH } from '../utils/xywh.js';
import { type BaseProps, ElementModel } from './base.js';
import { local, observe, yfield } from './decorators.js';

type MindmapElementProps = BaseProps & {
  nodes: Y.Map<{
    id: string;
    parent?: string;
  }>;
};

export class MindmapElementModel extends ElementModel<MindmapElementProps> {
  get type() {
    return 'mindmap';
  }

  @observe((_, instance: MindmapElementModel) => {
    instance.nodeIds = Array.from(instance.nodes.keys());
  })
  @yfield()
  nodes: Y.Map<{
    id: string;
    parent?: string;
  }> = new DocCollection.Y.Map();

  @local()
  nodeIds: string[] = [];

  override get rotate() {
    return 0;
  }

  override set rotate(_: number) {}

  get xywh() {
    let result: Bound | undefined;

    this.nodes.forEach(node => {
      const bound = this.surface.getElementById(node.id)?.elementBound;

      if (bound) {
        result = result ? result.unite(bound) : bound;
      }
    });

    return result?.serialize() ?? `[0,0,0,0]`;
  }

  set xywh(_: SerializedXYWH) {}

  hasNode(id: string) {
    return this.nodes.has(id);
  }

  addNode(id: string, parent: string) {
    this.nodes.set(id, { id, parent });
  }

  removeNode(id: string) {
    this.nodes.delete(id);
  }

  moveNode(id: string, parent: string) {
    const node = this.nodes.get(id);

    if (node) {
      this.nodes.set(id, { ...node, parent });
    }
  }
}
