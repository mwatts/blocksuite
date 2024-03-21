import { GroupLikeModel } from '../element-model/base.js';
import type { SurfaceBlockModel } from '../surface-model.js';

export function groupMiddleware(surface: SurfaceBlockModel) {
  const disposables = [
    surface.elementRemoved
      .filter(payload => payload.local)
      .on(({ id }) => {
        const group = surface.getGroup(id)!;

        group?.removeDescendant(id);
      }),
    surface.elementUpdated
      .filter(payload => payload.local)
      .on(({ id, props }) => {
        const element = surface.getElementById(id)!;

        if (element instanceof GroupLikeModel && props['childIds']) {
          if (element.childIds.length === 0) {
            surface.removeElement(id);
          }
        }
      }),
  ];

  return () => {
    disposables.forEach(d => d.dispose());
  };
}
