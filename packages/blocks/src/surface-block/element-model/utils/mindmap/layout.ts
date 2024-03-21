import type { ElementModel, SerializedXYWH } from '../../../index.js';
import { Bound } from '../../../utils/bound.js';
import type { MindmapElementModel } from '../../mindmap.js';

export const NODE_VERTICAL_SPACING = 30;
export const NODE_HORIZONTAL_SPACING = 120;

export type MindmapNode = {
  id: string;
  index: string;
  parent?: string;
  element: ElementModel;
  children: MindmapNode[];
};

export enum LayoutType {
  RIGHT = 0,
  LEFT = 1,
  BALANCE = 2,
}

type TreeSize = {
  /**
   * The root node of the tree
   */
  root: MindmapNode;

  /**
   * The size of the tree, including its descendants
   */
  bound: Bound;

  /**
   * The size of the children of the root
   */
  children: TreeSize[];
};

const calculateNodeSize = (node: MindmapNode) => {
  const bound = node.element.elementBound;

  if (!bound) {
    throw new Error('Node has no bound');
  }

  const children: TreeSize[] = [];
  if (node.children) {
    const childrenBound = node.children.reduce(
      (pre, node) => {
        const childSize = calculateNodeSize(node);

        children.push(childSize);

        pre.w = Math.max(pre.w, childSize.bound.w);
        pre.h +=
          pre.h > 0
            ? NODE_VERTICAL_SPACING + childSize.bound.h
            : childSize.bound.h;

        return pre;
      },
      new Bound(0, 0, 0, 0)
    );

    bound.w += childrenBound.w + NODE_HORIZONTAL_SPACING;
    bound.h = Math.max(bound.h, childrenBound.h);
  }

  return {
    root: node,
    bound,
    children,
  };
};

const layoutTree = (
  tree: TreeSize,
  layoutType: LayoutType,
  mindmap: MindmapElementModel
) => {
  const treeHeight = tree.bound.h;
  const currentX =
    layoutType === LayoutType.RIGHT
      ? tree.root.element.x + tree.root.element.w + NODE_HORIZONTAL_SPACING
      : tree.root.element.x - tree.bound.w - NODE_HORIZONTAL_SPACING;
  let currentY = tree.root.element.y + (tree.root.element.h - treeHeight) / 2;

  tree.children.forEach(childTree => {
    const childRoot = childTree.root.element;
    const childTreeHeight = childTree.bound.h;
    const xywh = `[${
      layoutType === LayoutType.RIGHT ? currentX : currentX - childRoot.w
    },${currentY + (childTreeHeight - childRoot.h) / 2},${childRoot.w},${childRoot.h}]` as SerializedXYWH;

    childRoot.xywh = xywh;

    mindmap.addConnector(tree.root, childTree.root, layoutType);
    layoutTree(childTree, layoutType, mindmap);

    currentY += childTreeHeight + NODE_VERTICAL_SPACING;
  });
};

const layoutRight = (root: MindmapNode, mindmap: MindmapElementModel) => {
  const rootTree = calculateNodeSize(root);

  layoutTree(rootTree, LayoutType.RIGHT, mindmap);
};

const layoutLeft = (root: MindmapNode, mindmap: MindmapElementModel) => {
  const rootTree = calculateNodeSize(root);

  layoutTree(rootTree, LayoutType.LEFT, mindmap);
};

const layoutBalance = (root: MindmapNode, mindmap: MindmapElementModel) => {
  const rootTree = calculateNodeSize(root);
  const leftTree: TreeSize[] = [];
  const rightTree: TreeSize[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  rootTree.children.forEach(childTree => {
    if (leftHeight < rightHeight) {
      leftTree.push(childTree);
      leftHeight += childTree.bound.h;
    } else {
      rightTree.push(childTree);
      rightHeight += childTree.bound.h;
    }
  });

  {
    const mockRoot = {
      root: rootTree.root,
      bound: rootTree.children.reduce(
        (pre, cur) => {
          pre.w = Math.max(pre.w, cur.bound.w);
          pre.h +=
            pre.h > 0 ? NODE_VERTICAL_SPACING + cur.bound.h : cur.bound.h;

          return pre;
        },
        new Bound(0, 0, 0, 0)
      ),
      children: leftTree,
    };

    layoutTree(mockRoot, LayoutType.LEFT, mindmap);
  }

  {
    const mockRoot = {
      root: rootTree.root,
      bound: rootTree.children.reduce(
        (pre, cur) => {
          pre.w = Math.max(pre.w, cur.bound.w);
          pre.h +=
            pre.h > 0 ? NODE_VERTICAL_SPACING + cur.bound.h : cur.bound.h;

          return pre;
        },
        new Bound(0, 0, 0, 0)
      ),
      children: rightTree,
    };

    layoutTree(mockRoot, LayoutType.RIGHT, mindmap);
  }
};

export const layout = (root: MindmapNode, mindmap: MindmapElementModel) => {
  switch (mindmap.layoutType) {
    case LayoutType.RIGHT:
      return layoutRight(root, mindmap);
    case LayoutType.LEFT:
      return layoutLeft(root, mindmap);
    case LayoutType.BALANCE:
      return layoutBalance(root, mindmap);
  }
};
