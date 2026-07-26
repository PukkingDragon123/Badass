/* BADASS APOCALYPSE - WebGL2 instanced renderer + post stack */
(function () {
  'use strict';
  const { m4, m4mul, m4perspective, m4lookAt, m4invert, composeInto, clamp } = BA;
  const S = BA.shaders;

  const FLOATS_PER_INST = 20; // mat4 + rgba

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error('shader compile failed:\n' + log + '\n' + numbered);
    }
    return sh;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    }
    p.u = new Proxy({}, {
      get(cache, name) {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
        return cache[name];
      },
    });
    return p;
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
      });
      if (!gl) throw new Error('WebGL2 is required to run BADASS APOCALYPSE.');
      this.gl = gl;
      this.canvas = canvas;
      this.w = 1; this.h = 1;

      this.progScene = program(gl, S.SCENE_VS, S.SCENE_FS);
      this.progGround = program(gl, S.GROUND_VS, S.GROUND_FS);
      this.progSky = program(gl, S.SKY_VS, S.SKY_FS);
      this.progShadow = program(gl, S.SHADOW_VS, S.SHADOW_FS);
      this.progDecal = program(gl, S.DECAL_VS, S.DECAL_FS);
      this.progBlur = program(gl, S.FS_QUAD_VS, S.BLUR_FS);
      this.progComposite = program(gl, S.FS_QUAD_VS, S.COMPOSITE_FS);

      this.emptyVao = gl.createVertexArray();

      this.meshes = {};
      const g = BA.geo;
      this.addMesh('box', g.box());
      this.addMesh('sphere', g.sphere(14, 10));
      this.addMesh('cyl', g.cylinder(16, 'y'));
      this.addMesh('cylX', g.cylinder(14, 'x'));
      this.addMesh('cone', g.cone(10));
      this.addMesh('disc', g.disc(26));
      this.addMesh('ring', g.ring(44, 0.74));
      this.addMesh('saw', g.saw(8));
      this.addMesh('groundQuad', g.plane(1));

      this.batches = { opaque: new Map(), glow: new Map(), shadow: new Map(), decal: new Map() };

      this.view = m4();
      this.proj = m4();
      this.viewProj = m4();
      this.invViewProj = m4();
      this.camPos = [0, 10, 20];
      this.fog = [0.40, 0.22, 0.19];
      this.fogDensity = 0.0040;
      this.time = 0;

      this.post = { bloom: 1.0, aberration: 0.0, vignette: 1.0, flash: 0, flashCol: [1, 1, 1], speedBlur: 0, hurt: 0 };

      this.fbo = null;
      this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720, 1);
    }

    addMesh(name, geo) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      const interleaved = new Float32Array(geo.pos.length * 2);
      for (let i = 0, n = geo.pos.length / 3; i < n; i++) {
        interleaved[i * 6] = geo.pos[i * 3];
        interleaved[i * 6 + 1] = geo.pos[i * 3 + 1];
        interleaved[i * 6 + 2] = geo.pos[i * 3 + 2];
        interleaved[i * 6 + 3] = geo.nrm[i * 3];
        interleaved[i * 6 + 4] = geo.nrm[i * 3 + 1];
        interleaved[i * 6 + 5] = geo.nrm[i * 3 + 2];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      const idx = geo.pos.length / 3 > 65535 ? new Uint32Array(geo.idx) : new Uint16Array(geo.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.meshes[name] = {
        vao, vbo, ibo, count: geo.idx.length,
        type: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      };
    }

    getBatch(layer, meshName) {
      const map = this.batches[layer];
      let b = map.get(meshName);
      if (b) return b;
      const gl = this.gl;
      const mesh = this.meshes[meshName];
      const cap = 256;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, cap * FLOATS_PER_INST * 4, gl.DYNAMIC_DRAW);
      for (let i = 0; i < 5; i++) {
        const loc = 2 + i;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, FLOATS_PER_INST * 4, i * 16);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      b = { mesh, vao, buf, cap, count: 0, data: new Float32Array(cap * FLOATS_PER_INST) };
      map.set(meshName, b);
      return b;
    }

    reserve(b) {
      if (b.count < b.cap) return true;
      const gl = this.gl;
      const cap = b.cap * 2;
      if (cap > 200000) return false;
      const data = new Float32Array(cap * FLOATS_PER_INST);
      data.set(b.data);
      b.data = data; b.cap = cap;
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.bufferData(gl.ARRAY_BUFFER, cap * FLOATS_PER_INST * 4, gl.DYNAMIC_DRAW);
      return true;
    }

    /* the one call everything draws through */
    push(mesh, layer, px, py, pz, yaw, pitch, roll, sx, sy, sz, r, g, b, emissive) {
      const bt = this.getBatch(layer, mesh);
      if (!this.reserve(bt)) return;
      const off = bt.count * FLOATS_PER_INST;
      composeInto(bt.data, off, px, py, pz, yaw, pitch, roll, sx, sy, sz);
      bt.data[off + 16] = r; bt.data[off + 17] = g; bt.data[off + 18] = b; bt.data[off + 19] = emissive;
      bt.count++;
    }

    shadow(x, z, radius, strength, y) {
      this.push('disc', 'shadow', x, y === undefined ? 0.012 : y, z, 0, 0, 0, radius * 2, 1, radius * 2, 0, 0, 0, strength);
    }

    decal(x, z, radius, yaw, r, g, b, alpha) {
      this.push('disc', 'decal', x, 0.02, z, yaw, 0, 0, radius * 2, 1, radius * 2, r, g, b, alpha);
    }

    resize(cssW, cssH, scale) {
      const gl = this.gl;
      const w = Math.max(2, Math.floor(cssW * scale));
      const h = Math.max(2, Math.floor(cssH * scale));
      if (w === this.w && h === this.h && this.fbo) return;
      this.w = w; this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;

      if (this.fbo) {
        gl.deleteFramebuffer(this.fbo.f);
        gl.deleteTexture(this.fbo.color);
        gl.deleteTexture(this.fbo.bright);
        gl.deleteRenderbuffer(this.fbo.depth);
        for (const p of this.pingpong) { gl.deleteFramebuffer(p.f); gl.deleteTexture(p.tex); }
      }

      const mkTex = (w2, h2) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w2, h2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };

      const color = mkTex(w, h);
      const bright = mkTex(w, h);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, bright, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      this.fbo = { f, color, bright, depth };

      this.bw = Math.max(2, w >> 2);
      this.bh = Math.max(2, h >> 2);
      this.pingpong = [0, 1].map(() => {
        const tex = mkTex(this.bw, this.bh);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { f: fb, tex };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    setCamera(eye, target, up, fov, near, far) {
      m4perspective(this.proj, fov, this.w / this.h, near, far);
      m4lookAt(this.view, eye[0], eye[1], eye[2], target[0], target[1], target[2], up[0], up[1], up[2]);
      m4mul(this.viewProj, this.proj, this.view);
      m4invert(this.invViewProj, this.viewProj);
      this.camPos[0] = eye[0]; this.camPos[1] = eye[1]; this.camPos[2] = eye[2];
    }

    beginFrame() {
      for (const layer in this.batches) for (const b of this.batches[layer].values()) b.count = 0;
    }

    /* unproject a normalised device coord onto the y=0 plane */
    screenToGround(ndcX, ndcY) {
      const m = this.invViewProj;
      const un = (z) => {
        const x = m[0] * ndcX + m[4] * ndcY + m[8] * z + m[12];
        const y = m[1] * ndcX + m[5] * ndcY + m[9] * z + m[13];
        const w2 = m[2] * ndcX + m[6] * ndcY + m[10] * z + m[14];
        const w = m[3] * ndcX + m[7] * ndcY + m[11] * z + m[15];
        return [x / w, y / w, w2 / w];
      };
      const a = un(-1), b = un(1);
      const dy = b[1] - a[1];
      if (Math.abs(dy) < 1e-6) return null;
      const t = (0 - a[1]) / dy;
      if (t < 0) return null;
      return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
    }

    worldToScreen(x, y, z, out) {
      const m = this.viewProj;
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.001) { out[2] = -1; return out; }
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[0] = (cx / cw * 0.5 + 0.5);
      out[1] = (1 - (cy / cw * 0.5 + 0.5));
      out[2] = cw;
      return out;
    }

    drawBatches(layer, prog) {
      const gl = this.gl;
      for (const b of this.batches[layer].values()) {
        if (!b.count) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.count * FLOATS_PER_INST);
        gl.bindVertexArray(b.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, b.mesh.count, b.mesh.type, 0, b.count);
      }
    }

    render(groundCenter) {
      const gl = this.gl;
      const P = this.post;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.f);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.viewport(0, 0, this.w, this.h);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // sky
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.progSky);
      gl.uniformMatrix4fv(this.progSky.u.uInvViewProj, false, this.invViewProj);
      gl.uniform3fv(this.progSky.u.uCam, this.camPos);
      gl.uniform3fv(this.progSky.u.uFog, this.fog);
      gl.uniform1f(this.progSky.u.uTime, this.time);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      // ground
      gl.useProgram(this.progGround);
      gl.uniformMatrix4fv(this.progGround.u.uViewProj, false, this.viewProj);
      gl.uniform3fv(this.progGround.u.uCam, this.camPos);
      gl.uniform3fv(this.progGround.u.uFog, this.fog);
      gl.uniform1f(this.progGround.u.uFogDensity, this.fogDensity);
      gl.uniform1f(this.progGround.u.uTime, this.time);
      gl.uniform3f(this.progGround.u.uCenter, groundCenter[0], 0, groundCenter[1]);
      gl.uniform1f(this.progGround.u.uSize, 1600);
      const gq = this.meshes.groundQuad;
      gl.bindVertexArray(gq.vao);
      gl.drawElements(gl.TRIANGLES, gq.count, gq.type, 0);

      // decals (alpha)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.progDecal);
      gl.uniformMatrix4fv(this.progDecal.u.uViewProj, false, this.viewProj);
      gl.uniform3fv(this.progDecal.u.uCam, this.camPos);
      gl.uniform3fv(this.progDecal.u.uFog, this.fog);
      gl.uniform1f(this.progDecal.u.uFogDensity, this.fogDensity);
      this.drawBatches('decal', this.progDecal);

      // blob shadows (multiply)
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.useProgram(this.progShadow);
      gl.uniformMatrix4fv(this.progShadow.u.uViewProj, false, this.viewProj);
      this.drawBatches('shadow', this.progShadow);

      // opaque world
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.useProgram(this.progScene);
      gl.uniformMatrix4fv(this.progScene.u.uViewProj, false, this.viewProj);
      gl.uniform3fv(this.progScene.u.uCam, this.camPos);
      gl.uniform3fv(this.progScene.u.uFog, this.fog);
      gl.uniform1f(this.progScene.u.uFogDensity, this.fogDensity);
      this.drawBatches('opaque', this.progScene);

      // additive glow
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      this.drawBatches('glow', this.progScene);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      /* ---- bloom ---- */
      gl.bindVertexArray(this.emptyVao);
      gl.viewport(0, 0, this.bw, this.bh);
      gl.useProgram(this.progBlur);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.progBlur.u.uTex, 0);
      let src = this.fbo.bright;
      for (let i = 0; i < 4; i++) {
        const dst = this.pingpong[i & 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.bindTexture(gl.TEXTURE_2D, src);
        const horiz = (i & 1) === 0;
        gl.uniform2f(this.progBlur.u.uDir, horiz ? 1.35 / this.bw : 0, horiz ? 0 : 1.35 / this.bh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = dst.tex;
      }

      /* ---- composite ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      gl.useProgram(this.progComposite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo.color);
      gl.uniform1i(this.progComposite.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(this.progComposite.u.uBloom, 1);
      gl.uniform1f(this.progComposite.u.uBloomAmt, P.bloom);
      gl.uniform1f(this.progComposite.u.uAberration, P.aberration);
      gl.uniform1f(this.progComposite.u.uVignette, P.vignette);
      gl.uniform1f(this.progComposite.u.uTime, this.time);
      gl.uniform1f(this.progComposite.u.uFlash, P.flash);
      gl.uniform3fv(this.progComposite.u.uFlashCol, P.flashCol);
      gl.uniform1f(this.progComposite.u.uSpeedBlur, P.speedBlur);
      gl.uniform1f(this.progComposite.u.uHurt, P.hurt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }
  }

  BA.Renderer = Renderer;
})();
