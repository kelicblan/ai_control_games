import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** A visible, enabled button can still be untappable behind another HUD surface. */
export async function expectCameraControlReachable(page: Page) {
  const geometry = await page.getByRole('button', { name: '调整营地视角', exact: true }).evaluate(button => {
    const camera = button.getBoundingClientRect();
    const rail = document.querySelector('.crew-rail')!.getBoundingClientRect();
    const hit = document.elementFromPoint(camera.x + camera.width / 2, camera.y + camera.height / 2);
    return {
      overlapsCrew: camera.left < rail.right && camera.right > rail.left
        && camera.top < rail.bottom && camera.bottom > rail.top,
      receivesPointer: hit?.closest('button') === button,
      hitLabel: hit?.closest('button')?.getAttribute('aria-label'),
    };
  });
  expect(geometry.overlapsCrew, 'Camera control must have its own area beside all five companions').toBe(false);
  expect(geometry.receivesPointer, `Camera control is covered by ${geometry.hitLabel ?? 'another surface'}`).toBe(true);
}
