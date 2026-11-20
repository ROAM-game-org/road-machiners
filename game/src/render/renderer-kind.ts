const SOFTWARE_RASTERIZER = /SwiftShader|llvmpipe|softpipe|Basic Render Driver|Software Rasterizer/i;

export function drawsInSoftware(renderer: string): boolean {
  return SOFTWARE_RASTERIZER.test(renderer);
}
