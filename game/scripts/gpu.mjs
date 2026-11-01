const ANGLE = {
  darwin: ['--use-angle=metal'],
  linux: ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'],
};
const SOFTWARE_RENDERERS = /SwiftShader|llvmpipe/;
const SOFTWARE_ONLY = ['--disable-dev-shm-usage'];

function gpuArgs() {
  const angle = ANGLE[process.platform];
  if (!angle) return null;
  return [...angle, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'];
}

export function rendererOf(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : 'no WebGL2';
  });
}

export function isSoftware(renderer) {
  return SOFTWARE_RENDERERS.test(renderer);
}

function warnSoftware(renderer) {
  const bar = '!'.repeat(72);
  console.error(`${bar}\nNO GPU. Chromium draws in software: ${renderer}.\nThis run is many times slower than on the GPU, and its frame rates mean nothing.\n${bar}`);
}

async function probe(browser) {
  const page = await browser.newPage();
  const renderer = await rendererOf(page);
  await page.close();
  return renderer;
}

async function launchGpu(chromium, options) {
  const args = gpuArgs();
  if (args === null) return { browser: null, why: `there are no GPU flags for ${process.platform}` };
  try {
    return { browser: await chromium.launch({ ...options, args: [...args, ...(options.args ?? [])] }) };
  } catch (error) {
    return { browser: null, why: `Chromium with the GPU flags did not start: ${error.message.split('\n')[0]}` };
  }
}

async function launchSoftware(chromium, options, why) {
  const browser = await chromium.launch({ ...options, args: [...SOFTWARE_ONLY, ...(options.args ?? [])] });
  return { browser, software: true, renderer: `${await probe(browser)}, since ${why}` };
}

async function launched(chromium, options) {
  const gpu = await launchGpu(chromium, options);
  if (gpu.browser === null) return launchSoftware(chromium, options, gpu.why);
  const renderer = await probe(gpu.browser);
  return { browser: gpu.browser, software: isSoftware(renderer), renderer };
}

export async function launchChromium(chromium, options = {}) {
  const run = await launched(chromium, options);
  if (run.software) warnSoftware(run.renderer);
  else console.log(`renderer ${run.renderer}`);
  return run;
}
