import { DocCollection, type Y } from '@blocksuite/store';
import { generateKeyBetween } from 'fractional-indexing';
import { isPlainObject } from 'merge';
import { z } from 'zod';

import type { EdgelessModel } from '../../_common/types.js';
import { last } from '../../_common/utils/iterable.js';
import { type Bound } from '../index.js';
import { ConnectorPathGenerator } from '../managers/connector-manager.js';
import { type SerializedXYWH } from '../utils/xywh.js';
import { type BaseProps, GroupLikeModel } from './base.js';
import { ConnectorMode, StatelessConnectorElementModel } from './connector.js';
import { convert, observe, yfield } from './decorators.js';
import type { MindmapNode } from './utils/mindmap/layout.js';
import { layout, LayoutType } from './utils/mindmap/layout.js';

const nodeSchema = z.record(
  z.object({
    parent: z.string().optional(),
  })
);

type MindmapElementProps = BaseProps & {
  nodes: Y.Map<{
    /**
     * The index of the node, it decides the layout order of the node
     */
    index: string;
    parent?: string;
  }>;
};

export class MindmapElementModel extends GroupLikeModel<MindmapElementProps> {
  get type() {
    return 'mindmap';
  }

  pathGenerator: ConnectorPathGenerator = new ConnectorPathGenerator({
    getElementById: (id: string) =>
      this.surface.getElementById(id) ??
      (this.surface.doc.getBlockById(id) as EdgelessModel),
  });

  @convert(initalValue => {
    if (isPlainObject(initalValue)) {
      nodeSchema.safeParse(initalValue);
    }

    const map = new DocCollection.Y.Map() as MindmapElementProps['nodes'];

    Object.keys(initalValue).forEach(key => {
      map.set(key, initalValue[key]);
    });

    return map;
  })
  @observe(
    (
      _,
      instance: MindmapElementModel,
      __,
      transaction: Y.Transaction | null
    ) => {
      console.log('f', [...instance.children.keys()]);
      instance.setChildIds(
        Array.from(instance.children.keys()),
        transaction?.local ?? false
      );
      instance['_buildTree'](instance.children);
    }
  )
  @yfield()
  children: Y.Map<{
    index: string;
    parent?: string;
  }> = new DocCollection.Y.Map();

  @yfield()
  layoutType: LayoutType = LayoutType.RIGHT;

  connectors: StatelessConnectorElementModel[] = [];

  private _tree!: MindmapNode;

  private _nodeMap = new Map<string, MindmapNode>();

  override get rotate() {
    return 0;
  }

  override set rotate(_: number) {}

  get xywh() {
    let result: Bound | undefined;

    this.children.forEach((_, id) => {
      const bound = this.surface.getElementById(id)?.elementBound;

      if (bound) {
        result = result ? result.unite(bound) : bound;
      }
    });

    return result?.serialize() ?? `[0,0,0,0]`;
  }

  set xywh(_: SerializedXYWH) {}

  private _buildTree(nodesMap: MindmapElementProps['nodes']) {
    const mindmapNodeMap = new Map<string, MindmapNode>();
    let rootNode: MindmapNode | undefined;

    nodesMap.forEach((val, id) => {
      const node =
        mindmapNodeMap.get(id) ??
        ({
          id,
          parent: val.parent,
          index: val.index,
          element: this.surface.getElementById(id)!,
          children: [],
        } as MindmapNode);

      if (!mindmapNodeMap.has(id)) {
        mindmapNodeMap.set(id, node);
      }

      node.parent = val.parent;
      node.index = val.index;

      if (!val.parent) {
        rootNode = node;
      } else if (mindmapNodeMap.has(val.parent)) {
        const parentNode = mindmapNodeMap.get(val.parent)!;
        parentNode.children = parentNode.children || [];
        parentNode.children.push(node);
      } else {
        mindmapNodeMap.set(val.parent, {
          id: val.parent,
          index: '',
          children: [node],
          element: this.surface.getElementById(val.parent)!,
        });
      }
    });

    mindmapNodeMap.forEach(node => {
      node.children.sort((a, b) => a.index.localeCompare(b.index));
    });

    if (!rootNode) {
      return;
    }

    this._nodeMap = mindmapNodeMap;
    this._tree = rootNode;
    this.layout();
  }

  getParentNode(id: string) {
    const node = this.children.get(id);

    return node?.parent ? this.surface.getElementById(node.parent) : null;
  }

  addNode(
    id: string,
    parent: string,
    sibling?: string,
    position: 'before' | 'after' = 'after'
  ) {
    if (!this._nodeMap.has(parent)) {
      console.warn(`Parent node ${parent} not found`);
      return;
    }

    const parentNode = this._nodeMap.get(parent)!;

    sibling = sibling ?? last(parentNode.children)?.id;

    if (sibling) {
      const siblingNode = this._nodeMap.get(sibling)!;
      const siblingIndex = parentNode.children.findIndex(
        val => val.id === sibling
      );
      const index =
        position === 'after'
          ? generateKeyBetween(
              siblingNode.index,
              parentNode.children[siblingIndex + 1]?.index ?? null
            )
          : generateKeyBetween(
              parentNode.children[siblingIndex - 1].index ?? null,
              siblingNode.index
            );

      this.children.set(id, { index, parent });
    } else {
      this.children.set(id, { index: 'a0', parent });
    }
  }

  removeDescendant(id: string, transaction: boolean = true) {
    if (!this._nodeMap.has(id)) {
      return;
    }

    const node = this._nodeMap.get(id)!;
    const remove = () => {
      node.children.forEach(child => {
        this.removeDescendant(child.id, false);
      });

      this.children.delete(id);
    };

    if (transaction) {
      this.surface.doc.transact(() => {
        remove();
      });
    } else {
      remove();
    }
  }

  layout() {
    this.connectors = [];
    this.surface.doc.transact(() => {
      layout(this._tree, this);
    });
  }

  addConnector(from: MindmapNode, to: MindmapNode, layout: LayoutType) {
    const connector = new StatelessConnectorElementModel();

    connector.source = {
      id: from.id,
      position: layout === LayoutType.RIGHT ? [1, 0.5] : [0, 0.5],
    };
    connector.target = {
      id: to.id,
      position: layout === LayoutType.RIGHT ? [0, 0.5] : [1, 0.5],
    };
    connector.id = `#${from.id}-${to.id}`;
    connector.mode = ConnectorMode.Curve;

    this.pathGenerator.updatePath(connector);

    this.connectors.push(connector);
  }
}
