import type { Corners, Mat3, WarpOptions } from './types';
import { computeHomography, invert3x3, toColumnMajor } from './homography';

const VERT_SRC = `
attribute vec2 a_pos;       // full-screen quad in clip space [-1,1]
varying vec2 v_out;         // output space [0,1], origin top-left
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_out = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
}
`;

const FRAG_SRC = `
precision highp float;
uniform mat3 u_Hinv;        // output space -> source UV
uniform sampler2D u_tex;
varying vec2 v_out;
void main() {
  vec3 p = u_Hinv * vec3(v_out, 1.0);
  vec2 uv = p.xy / p.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  // Textures are uploaded with UNPACK_FLIP_Y_WEBGL = false, so source-data row 0
  // (visual top, UV y=0) lands at texture t=0. UV is top-left origin to match, so
  // sample directly with no v flip.
  gl_FragColor = texture2D(u_tex, uv);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('Failed to create shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

export interface WarpProgram {
  program: WebGLProgram;
  a_pos: number;
  u_Hinv: WebGLUniformLocation;
  u_tex: WebGLUniformLocation;
  quadBuffer: WebGLBuffer;
}

export function buildProgram(gl: WebGLRenderingContext): WarpProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create WebGL program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The linked program retains its own compiled copies; free the standalone
  // shader objects now (deletion defers until they detach on program delete).
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link failed: ' + log);
  }
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) throw new Error('Failed to create quad buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  // Two triangles covering clip space.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  return {
    program,
    a_pos: gl.getAttribLocation(program, 'a_pos'),
    u_Hinv: gl.getUniformLocation(program, 'u_Hinv')!,
    u_tex: gl.getUniformLocation(program, 'u_tex')!,
    quadBuffer,
  };
}

/** Draw the warp for a given inverse homography into the current framebuffer. */
export function drawWarp(
  gl: WebGLRenderingContext,
  prog: WarpProgram,
  texture: WebGLTexture,
  Hinv: Mat3,
  width: number,
  height: number
): void {
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, prog.quadBuffer);
  gl.enableVertexAttribArray(prog.a_pos);
  gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);

  gl.uniformMatrix3fv(prog.u_Hinv, false, toColumnMajor(Hinv));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(prog.u_tex, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export interface Renderer {
  readonly canvas: HTMLCanvasElement;
  render(corners: Corners): void;
  toBlob(): Promise<Blob>;
  toDataUrl(): string;
  destroy(): void;
}

/**
 * Browser renderer: uploads a TexImageSource and renders warps into an
 * offscreen canvas at outputWidth x outputHeight (clamped to MAX_TEXTURE_SIZE).
 */
export function createRenderer(source: TexImageSource, opts: WarpOptions): Renderer {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL not supported');

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const scale = Math.min(1, maxTex / Math.max(opts.outputWidth, opts.outputHeight));
  const width = Math.max(1, Math.round(opts.outputWidth * scale));
  const height = Math.max(1, Math.round(opts.outputHeight * scale));
  canvas.width = width;
  canvas.height = height;

  const prog = buildProgram(gl);

  const texture = gl.createTexture();
  if (!texture) throw new Error('Failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    canvas,
    render(corners: Corners) {
      const Hinv = invert3x3(computeHomography(corners));
      drawWarp(gl, prog, texture, Hinv, width, height);
    },
    toBlob() {
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
          'image/png'
        );
      });
    },
    toDataUrl() {
      return canvas.toDataURL('image/png');
    },
    destroy() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(prog.quadBuffer);
      gl.deleteProgram(prog.program);
    },
  };
}
