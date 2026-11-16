
import { t, type Msg } from '../text/msg';

export class WebGLUnavailable extends Error {
  readonly reason: string | null;
  constructor(reason: string | null, options?: { cause?: unknown }) {
    super(`This browser could not create a WebGL 2 context${reason ? `: ${reason}` : ''}`, options);
    this.name = 'WebGLUnavailable';
    this.reason = reason;
  }
}

export type WebGLSurface = { canvas: HTMLCanvasElement; context: WebGL2RenderingContext };

export const GAME_GL: WebGLContextAttributes = {
  alpha: true,
  depth: true,
  stencil: true,
  antialias: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
};

let drawing: string | null = null;

export function drawingRenderer(): string | null {
  return drawing;
}

export function rendererOf(context: WebGL2RenderingContext): string {
  const info = context.getExtension('WEBGL_debug_renderer_info');
  return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
}

export function openWebGL(canvas: HTMLCanvasElement, attributes: WebGLContextAttributes): WebGLSurface {
  let reason: string | null = null;
  const onCreationError = (e: Event) => {
    reason = (e as WebGLContextEvent).statusMessage || null;
  };
  canvas.addEventListener('webglcontextcreationerror', onCreationError);
  try {
    const context = canvas.getContext('webgl2', attributes);
    if (!context) throw new WebGLUnavailable(reason);
    drawing = rendererOf(context);
    return { canvas, context };
  } catch (e) {
    if (e instanceof WebGLUnavailable) throw e;
    throw new WebGLUnavailable(reason, { cause: e });
  } finally {
    canvas.removeEventListener('webglcontextcreationerror', onCreationError);
  }
}

export function noWebGLText(err: WebGLUnavailable, userAgent: string): { title: Msg; lines: Msg[]; detail: string | null } {
  const lines = [t('webgl.intro'), t('webgl.acceleration'), t('webgl.driver'), t('webgl.browser')];
  if (userAgent.includes('Firefox/')) lines.push(t('webgl.firefox'));
  lines.push(t('webgl.saves'));
  return { title: t('webgl.title'), lines, detail: err.reason };
}
