import { test, expect, type Page } from '@playwright/test';

/** 实际浏览器验收：只阻止可选GGUF下载，世界、渲染、MLP与存档均使用生产代码。 */
async function openWorld(page: Page) {
  await page.route('**/minimind/model.json', route => route.fulfill({ json: { available: false } }));
  await page.goto('/');
  await expect(page.locator('.camp-map')).toHaveAttribute('data-scene-state', 'ready', {timeout:30_000});
  await page.getByRole('button', {name:/^(点亮篝火，出发吧|重新开始一段旅程|出发，开始新的一局)$/}).click();
  await page.getByRole('button', {name:'暂停游戏',exact:true}).click();
  await expect(page.locator('.world-atlas')).toBeVisible();
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-loaded-chunks', /[1-9]/);
}
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test(`连续世界：平移、鹰眼、迷雾和回营 ${viewport.width}`,async({page},info)=>{
    await page.setViewportSize(viewport);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await openWorld(page);
    const scene=page.locator('.scene-canvas'), atlas=page.locator('.world-atlas-canvas');
    const before=await scene.getAttribute('data-exploration-revision');
    const focus=Number(await scene.getAttribute('data-focus-x'));
    const box=(await scene.boundingBox())!;
    await page.mouse.move(box.x+box.width*.4,box.y+box.height*.48);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.18,box.y+box.height*.52,{steps:8});await page.mouse.up();
    await expect.poll(async()=>Number(await scene.getAttribute('data-focus-x'))).not.toBe(focus);
    await page.getByRole('button',{name:'镜头返回营地',exact:true}).click();
    await expect(scene).toHaveAttribute('data-focus-x','50.00');
    await page.screenshot({path:info.outputPath(`camp-${viewport.width}.png`)});
    await page.getByRole('button',{name:'展开世界地图',exact:true}).click();
    await expect(page.locator('.world-atlas')).toHaveClass(/is-expanded/);
    await page.screenshot({path:info.outputPath(`atlas-${viewport.width}.png`)});
    // 先实际查看北侧山地，验证营地以外并非只有一张鹰眼贴图。
    await atlas.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
    await expect.poll(async()=>Number(await scene.getAttribute('data-focus-y'))).toBeLessThan(-600);
    await page.keyboard.press('Escape');
    await page.screenshot({path:info.outputPath(`highlands-${viewport.width}.png`)});
    await page.getByRole('button',{name:'镜头返回营地',exact:true}).click();
    await page.getByRole('button',{name:'展开世界地图',exact:true}).click();
    await atlas.focus();for(let i=0;i<5;i++)await page.keyboard.press('ArrowLeft');
    await expect.poll(async()=>Number(await scene.getAttribute('data-focus-x'))).toBeLessThan(-1000);
    await expect(scene).toHaveAttribute('data-exploration-revision',before??'0');
    // 16km只是鹰眼一次显示宽度；可不断平移，绘制块始终有预算。
    expect(Number(await scene.getAttribute('data-loaded-chunks'))).toBeLessThanOrEqual(169);
    await page.keyboard.press('Escape');
    await page.screenshot({path:info.outputPath(`unknown-${viewport.width}.png`)});
    await page.getByRole('button',{name:'镜头返回营地',exact:true}).click();
    await expect(scene).toHaveAttribute('data-focus-x','50.00');
    await page.getByRole('button',{name:'跟随选中的伙伴',exact:true}).click();
    await expect(scene).toHaveAttribute('data-camera-mode','follow');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
