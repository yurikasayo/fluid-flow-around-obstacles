let gl;

// パラメータの設定
// set the parameters
const frameWidth = 256;
const frameHeight = 128;

const u0 = 0.3 + 0.5;
const v0 = 0.0 + 0.5;
const p0 = 0.5;
const dt = 0.016;
const Re = 300.0;
const h = 0.7;
const objX = 0.2;
const objY = 0.5;
const objSize = 0.08;
const steps = 10;

const easingRate = 0.02;

// 変数の設定
// set the variables
let addY = 0;
let addY0 = 0;
let hue = 0.0;
let saturation = 1.0;
let brightness = 0.0;
let brightness0 = 0.0;

// 現在のフレーム番号
// current frame
let vFrame = 0;
let pFrame = 0;
let dFrame = 0;

// 実行
// execute
window.setTimeout(main, 0);

function main() {
    // キャンバスの大きさの設定
    // set the canvas size
    const canvas  = document.getElementById('canvas');
    const wrapper = document.getElementById('wrapper');
    canvas.width  = wrapper.clientWidth;
    canvas.height = wrapper.clientWidth / 2.0;

    const width = canvas.width;
    const height = canvas.height;

    // マウス・タッチイベント
    // mouse events and touch events
    canvas.addEventListener('mousemove', mouseMove, true);
    canvas.addEventListener('touchmove', touchMove, true);
    
    
    function mouseMove(e) {
        brightness0 = Math.exp(-e.offsetX / width * 2.0);
        addY0 = e.offsetY * frameHeight / height;
    }


    function touchMove(e) {
        e.preventDefault();
        const offsetX = e.touches[0].pageX - canvas.offsetLeft;    
        const offsetY = e.touches[0].pageY - canvas.offsetTop + height / 2;
        brightness0 = Math.exp(-offsetX / width * 2.0);
        addY0 = offsetY * frameHeight / height;
    }

    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }
    
    // フレームバッファの初期化
    // initialize frame buffers
    const velocity = [];
    const pressure = [];
    const density  = []; 
    for (let i = 0; i < 2; i++) {
        velocity.push(initFrame(frameWidth, frameHeight));
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity[i].fb);
        gl.clearColor(u0, v0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        pressure.push(initFrame(frameWidth, frameHeight));
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure[i].fb);
        gl.clearColor(p0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        density.push(initFrame(frameWidth, frameHeight));
        gl.bindFramebuffer(gl.FRAMEBUFFER, density[i].fb);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    
    // シェーダ―の記述
    // write shaders
    const vert = `
    // 共通の頂点シェーダー

    attribute vec2 aPosition;

    uniform mat4 uModelViewMatrix;

    void main(void) {
        gl_Position = uModelViewMatrix * vec4(aPosition, 0.0, 1.0);
    }
    `;
    const boundaryFrag = `
    // 速度場の境界条件
    precision mediump float;

    uniform sampler2D velocity;
    uniform vec2 resolution;
    uniform vec2 objPos;
    uniform float objSize;
    uniform float u0;

    void main() {
        vec2 pos = gl_FragCoord.xy;
        vec2 uv = texture2D(velocity, pos / resolution).xy;

        vec2 len = abs(pos - objPos);
        if (pos.y < 1.0) {
            vec2 uv0 = texture2D(velocity, (pos + vec2(0.0, 1.0)) / resolution).xy;
            uv = 1.0 - uv0;
        } else if (pos.y > resolution.y - 1.0) {
            vec2 uv0 = texture2D(velocity, (pos - vec2(0.0, 1.0)) / resolution).xy;
            uv = 1.0 - uv0;
        } else if (max(len.x, len.y) < objSize) {
            uv = vec2(0.5);
        } else if (len.x < objSize && len.y < objSize - 1.0) {
            vec2 uv0 = texture2D(velocity, (pos + vec2(pos.x - objPos.x, 0.0) / len) / resolution).xy;
            uv = 1.0 - uv0;
        } else if (len.x < objSize - 1.0 && len.y < objSize) {
            vec2 uv0 = texture2D(velocity, (pos + vec2(0.0, pos.y - objPos.y) / len) / resolution).xy;
            uv = 1.0 - uv0;
        } else if (max(len.x, len.y) < objSize) {
            vec2 uv0 = texture2D(velocity, (pos + (pos - objPos) / len) / resolution).xy;
            uv = 1.0 - uv0;
        } else if (pos.x < 1.0) {
            uv = vec2(u0, 0.5);
        } else if (pos.x >= resolution.x - 1.0) {
            uv.x = texture2D(velocity, (pos - vec2(1.0, 0.0)) / resolution).x;
        }

        gl_FragColor = vec4(uv, 0.0, 1.0);
    }
    `;
    const diffuseFrag  = `
    // diffuse : 拡散項
    precision mediump float;

    uniform sampler2D texture;
    uniform vec2 resolution;
    uniform float re;
    uniform float dt;
    uniform float h;

    void main() {
        vec2 pos = gl_FragCoord.xy;

        vec3 col0 = texture2D(texture, pos / resolution).rgb;
        vec3 col1 = texture2D(texture, (pos + vec2(1.0, 0.0)) / resolution).rgb;
        vec3 col2 = texture2D(texture, (pos - vec2(1.0, 0.0)) / resolution).rgb;
        vec3 col3 = texture2D(texture, (pos + vec2(0.0, 1.0)) / resolution).rgb;
        vec3 col4 = texture2D(texture, (pos - vec2(0.0, 1.0)) / resolution).rgb;
        
        vec3 laplacian = (col1 + col2 + col3 + col4 - 4.0 * col0) / (h * h);

        vec3 color = col0 + dt * laplacian / re;

        gl_FragColor = vec4(color, 1.0);
    }
    `;
    const advectFrag   = `
    // advect : 移流項
    precision mediump float;

    uniform sampler2D velocity;
    uniform sampler2D texture;
    uniform vec2 resolution;
    uniform float dt;

    void main() {
        vec2 pos = gl_FragCoord.xy / resolution;
        vec2 pos_to = pos - (texture2D(velocity, pos).xy - 0.5) * dt ;

        vec3 color = texture2D(texture, pos_to).rgb;
        
        gl_FragColor = vec4(color, 1.0);
    }
    `;
    const pressureFrag = `
    // 圧力場の計算
    precision mediump float;

    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 resolution;
    uniform vec2 objPos;
    uniform float objSize;
    uniform float dt;
    uniform float h;

    void main() {
        vec2 pos = gl_FragCoord.xy;

        float p1 = texture2D(pressure, (pos + vec2(1.0, 0.0)) / resolution).x;
        float p2 = texture2D(pressure, (pos - vec2(1.0, 0.0)) / resolution).x;
        float p3 = texture2D(pressure, (pos + vec2(0.0, 1.0)) / resolution).x;
        float p4 = texture2D(pressure, (pos - vec2(0.0, 1.0)) / resolution).x;

        float u1 = texture2D(velocity, (pos + vec2(1.0, 0.0)) / resolution).x;
        float u2 = texture2D(velocity, (pos - vec2(1.0, 0.0)) / resolution).x;
        float v1 = texture2D(velocity, (pos + vec2(0.0, 1.0)) / resolution).y;
        float v2 = texture2D(velocity, (pos - vec2(0.0, 1.0)) / resolution).y;

        float div = (u1 - u2 + v1 - v2) * h / 2.0;
        float p = (p1 + p2 + p3 + p4 - div) / 4.0;

        // 境界条件
        vec2 len = abs(pos / resolution - objPos);
        if (pos.y < 1.0) {
            p = p3;
        } else if (pos.y > resolution.y - 1.0) {
            p = p4;
        } else if (max(len.x, len.y) < objSize - 1.0) {
            p = 0.5;
        } else if (len.x < objSize && len.y < objSize - 1.0) {
            p = texture2D(pressure, (pos + vec2(pos.x - objPos.x, 0.0) / len) / resolution).x;
        } else if (len.x < objSize - 1.0 && len.y < objSize) {
            p = texture2D(pressure, (pos + vec2(0.0, pos.y - objPos.y) / len) / resolution).x;
        } else if (max(len.x, len.y) < objSize) {
            p = texture2D(pressure, (pos + (pos - objPos) / len) / resolution).x;
        } else if (pos.x < 1.0) {
            p = p1;
        } else if (pos.x >= resolution.x - 1.0) {
            p = 0.5;
        }

        gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
    }
    `;
    const projectFrag  = `
    // 圧力項
    precision mediump float;

    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 resolution;
    uniform float dt;
    uniform float h;

    void main() {
        vec2 pos = gl_FragCoord.xy;

        float p1 = texture2D(pressure, (pos + vec2(1.0, 0.0)) / resolution).x;
        float p2 = texture2D(pressure, (pos - vec2(1.0, 0.0)) / resolution).x;
        float p3 = texture2D(pressure, (pos + vec2(0.0, 1.0)) / resolution).x;
        float p4 = texture2D(pressure, (pos - vec2(0.0, 1.0)) / resolution).x;

        vec2 uv = texture2D(velocity, pos / resolution).xy;
        uv -= vec2(p1 - p2, p3 - p4) / (2.0 * h);

        gl_FragColor = vec4(uv, 0.0, 1.0);
    }
    `;
    const densityFrag  = `
    // 密度場の境界条件
    precision mediump float;

    uniform sampler2D density;
    uniform vec2 resolution;
    uniform vec2 objPos;
    uniform float objSize;
    uniform vec3 addColor;
    uniform float addY;

    //  Function from Iñigo Quiles
    //  https://www.shadertoy.com/view/MsS3Wc
    vec3 hsb2rgb( in vec3 c ){
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix( vec3(1.0), rgb, c.y);
    }

    void main() {
        vec2 pos = gl_FragCoord.xy;

        vec3 color = texture2D(density, pos / resolution).rgb;

        vec2 len = abs(pos - objPos);
        if (pos.y < 1.0) {
            color = vec3(0.0);
        } else if (pos.y > resolution.y - 1.0) {

            color = vec3(0.0);
        } else if (max(len.x, len.y) < objSize) {
            color = vec3(0.0);
        } else if (pos.x < 1.0) {
            float dist = abs(pos.y - resolution.y + addY);
            color = hsb2rgb(addColor) * smoothstep(resolution.y * 0.1, resolution.y * 0.05, dist);
        }

        gl_FragColor = vec4(color, 1.0);
    }
    `;
    const displayFrag  = `
    // 描画用
    precision mediump float;

    uniform sampler2D texture;
    uniform vec2 resolution;
    uniform vec2 objPos;
    uniform float objSize;

    void main() {
        vec2 pos = gl_FragCoord.xy;
        gl_FragColor = texture2D(texture, pos / resolution);

        vec2 len = abs(pos - objPos);
        if (max(len.x, len.y) < objSize) {
            gl_FragColor = vec4(vec3(0.2), 1.0);
        }
    }
    `;
    
    // シェーダーの初期化
    // initialize shader programs
    const boundaryShader = initShader(vert, boundaryFrag);
    const diffuseShader  = initShader(vert, diffuseFrag);
    const advectShader   = initShader(vert, advectFrag);
    const pressureShader = initShader(vert, pressureFrag);
    const projectShader  = initShader(vert, projectFrag);
    const densityShader  = initShader(vert, densityFrag);
    const displayShader  = initShader(vert, displayFrag);

    // attribute変数の位置を取得
    // get the location of attribute variables
    const boundaryAttrib = gl.getAttribLocation(boundaryShader, 'aPosition');
    const diffuseAttrib  = gl.getAttribLocation(diffuseShader,  'aPosition');
    const advectAttrib   = gl.getAttribLocation(advectShader,   'aPosition');
    const pressureAttrib = gl.getAttribLocation(pressureShader, 'aPosition');
    const projectAttrib  = gl.getAttribLocation(projectShader,  'aPosition');
    const densityAttrib  = gl.getAttribLocation(densityShader,  'aPosition');
    const displayAttrib  = gl.getAttribLocation(displayShader,  'aPosition');

    // uniform変数の位置を取得
    // get the location of uniform variables
    const boundaryUniforms = {
        modelviewMatrix : gl.getUniformLocation(boundaryShader, 'uModelViewMatrix'),
        velocity        : gl.getUniformLocation(boundaryShader, 'velocity'),
        resolution      : gl.getUniformLocation(boundaryShader, 'resolution'),
        objPos          : gl.getUniformLocation(boundaryShader, 'objPos'),
        objSize         : gl.getUniformLocation(boundaryShader, 'objSize'),
        u0              : gl.getUniformLocation(boundaryShader, 'u0'),
    };
    const diffuseUniforms = {
        modelviewMatrix : gl.getUniformLocation(diffuseShader, 'uModelViewMatrix'),
        texture         : gl.getUniformLocation(diffuseShader, 'texture'),
        resolution      : gl.getUniformLocation(diffuseShader, 'resolution'),
        re              : gl.getUniformLocation(diffuseShader, 're'),
        dt              : gl.getUniformLocation(diffuseShader, 'dt'),
        h               : gl.getUniformLocation(diffuseShader, 'h'),
    };
    const advectUniforms = {
        modelviewMatrix : gl.getUniformLocation(advectShader, 'uModelViewMatrix'),
        velocity        : gl.getUniformLocation(advectShader, 'velocity'),
        texture         : gl.getUniformLocation(advectShader, 'texture'),
        resolution      : gl.getUniformLocation(advectShader, 'resolution'),
        dt              : gl.getUniformLocation(advectShader, 'dt'),
    };
    const pressureUniforms = {
        modelviewMatrix : gl.getUniformLocation(pressureShader, 'uModelViewMatrix'),
        velocity        : gl.getUniformLocation(pressureShader, 'velocity'),
        pressure        : gl.getUniformLocation(pressureShader, 'pressure'),
        resolution      : gl.getUniformLocation(pressureShader, 'resolution'),
        objPos          : gl.getUniformLocation(pressureShader, 'objPos'),
        objSize         : gl.getUniformLocation(pressureShader, 'objSize'),
        dt              : gl.getUniformLocation(pressureShader, 'dt'),
        h               : gl.getUniformLocation(pressureShader, 'h'),
    };
    const projectUniforms = {
        modelviewMatrix : gl.getUniformLocation(projectShader, 'uModelViewMatrix'),
        velocity        : gl.getUniformLocation(projectShader, 'velocity'),
        pressure        : gl.getUniformLocation(projectShader, 'pressure'),
        resolution      : gl.getUniformLocation(projectShader, 'resolution'),
        dt              : gl.getUniformLocation(projectShader, 'dt'),
        h               : gl.getUniformLocation(projectShader, 'h'),
    };
    const densityUniforms = {
        modelviewMatrix : gl.getUniformLocation(densityShader, 'uModelViewMatrix'),
        density         : gl.getUniformLocation(densityShader, 'density'),
        resolution      : gl.getUniformLocation(densityShader, 'resolution'),
        objPos          : gl.getUniformLocation(densityShader, 'objPos'),
        objSize         : gl.getUniformLocation(densityShader, 'objSize'),
        addColor        : gl.getUniformLocation(densityShader, 'addColor'),
        addY            : gl.getUniformLocation(densityShader, 'addY'),
    };
    const displayUniforms = {
        modelviewMatrix : gl.getUniformLocation(displayShader, 'uModelViewMatrix'),
        texture         : gl.getUniformLocation(displayShader, 'texture'),
        resolution      : gl.getUniformLocation(displayShader, 'resolution'),
        objPos          : gl.getUniformLocation(displayShader, 'objPos'),
        objSize         : gl.getUniformLocation(displayShader, 'objSize'),
    };
    
    // 頂点バッファの初期化
    // initialize vertex buffer objects
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
         1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
        -1.0, -1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // 座標変換行列の計算
    // calculate the matrices
    const pMatrix = mat4.create();
    mat4.ortho(pMatrix, -1.0, 1.0, -1.0, 1.0, 0.1, 1000.0);
    const mMatrix = mat4.create();
    mat4.translate(mMatrix, mMatrix, [0.0, 0.0, -10.0]);
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, pMatrix, mMatrix);
    
    // 速度場の境界条件
    // velocity field boundary conditions
    function velocityBoundary() {
        vFrame = 1 - vFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity[vFrame].fb);

        gl.useProgram(boundaryShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity[1-vFrame].cb);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(boundaryAttrib);
        gl.vertexAttribPointer(boundaryAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(boundaryUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(boundaryUniforms.velocity, 0);
        gl.uniform2f(boundaryUniforms.resolution, frameWidth, frameHeight);
        gl.uniform2f(boundaryUniforms.objPos, objX * frameWidth, objY * frameHeight);
        gl.uniform1f(boundaryUniforms.objSize, objSize * frameHeight);
        gl.uniform1f(boundaryUniforms.u0, u0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
    }

    // インク場の境界条件
    // density field boundary conditions
    function densityBoundary() {
        dFrame = 1 - dFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, density[dFrame].fb);

        gl.useProgram(densityShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density[1-dFrame].cb);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(densityAttrib);
        gl.vertexAttribPointer(densityAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(densityUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(densityUniforms.density, 0);
        gl.uniform2f(densityUniforms.resolution, frameWidth, frameHeight);
        gl.uniform2f(densityUniforms.objPos, objX * frameWidth, objY *frameHeight);
        gl.uniform1f(densityUniforms.objSize, objSize * frameHeight);
        gl.uniform3f(densityUniforms.addColor, hue, saturation, brightness);
        gl.uniform1f(densityUniforms.addY, addY);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
    }
    
    
    // シーンの描画
    // draw the scene
    function render() {
        addY += (addY0 - addY) * easingRate;
        brightness += (brightness0 - brightness) * easingRate;
        hue += 0.001;
        hue -= Math.floor(hue);
        
        // 速度場の計算(1) : 拡散項
        // calculate the velocity field (1) : diffuse
        vFrame = 1 - vFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity[vFrame].fb);

        gl.useProgram(diffuseShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity[1-vFrame].cb);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(diffuseAttrib);
        gl.vertexAttribPointer(diffuseAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(diffuseUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(diffuseUniforms.texture, 0);
        gl.uniform2f(diffuseUniforms.resolution, frameWidth, frameHeight);
        gl.uniform1f(diffuseUniforms.re, Re);
        gl.uniform1f(diffuseUniforms.dt, dt);
        gl.uniform1f(diffuseUniforms.h, h);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
        
        velocityBoundary();
        
        // 速度場の計算(2) : 移流項
        // calculate the velosity field (2) : advect
        vFrame = 1 - vFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity[vFrame].fb);

        gl.useProgram(advectShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity[1-vFrame].cb);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(advectAttrib);
        gl.vertexAttribPointer(advectAttrib, 2, gl.FLOAT, false, 0, 0);
        
        gl.uniformMatrix4fv(advectUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(advectUniforms.velocity, 0);
        gl.uniform1i(advectUniforms.texture, 0);
        gl.uniform2f(advectUniforms.resolution, frameWidth, frameHeight);
        gl.uniform1f(advectUniforms.dt, dt);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        velocityBoundary();
        
        // 圧力場の計算
        // calculate the pressure field
        for (let i = 0; i < steps; i++) {
            pFrame = 1 - pFrame;

            gl.bindFramebuffer(gl.FRAMEBUFFER, pressure[pFrame].fb);

            gl.useProgram(pressureShader);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity[vFrame].cb);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pressure[1-pFrame].cb);

            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.enableVertexAttribArray(pressureAttrib);
            gl.vertexAttribPointer(pressureAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.uniformMatrix4fv(pressureUniforms.modelviewMatrix, false, mvpMatrix);
            gl.uniform1i(pressureUniforms.velocity, 0);
            gl.uniform1i(pressureUniforms.pressure, 1);
            gl.uniform2f(pressureUniforms.resolution, frameWidth, frameHeight);
            gl.uniform2f(pressureUniforms.objPos, objX * frameWidth, objY * frameHeight);
            gl.uniform1f(pressureUniforms.objSize, objSize * frameHeight);
            gl.uniform1f(pressureUniforms.dt, dt);
            gl.uniform1f(pressureUniforms.h, h);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.flush();
        }

        // 速度場の計算(3) : 圧力項
        // calculate the velocity field (3) : project
        vFrame = 1 - vFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity[vFrame].fb);

        gl.useProgram(projectShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity[1-vFrame].cb);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, pressure[pFrame].cb);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(projectAttrib);
        gl.vertexAttribPointer(projectAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(projectUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(projectUniforms.velocity, 0);
        gl.uniform1i(projectUniforms.pressure, 1);
        gl.uniform2f(projectUniforms.resolution, frameWidth, frameHeight);
        gl.uniform1f(projectUniforms.dt, dt);
        gl.uniform1f(projectUniforms.h, h);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        // インク場の計算(1) : 拡散項
        // calculate the density field (1) : diffuse
        dFrame = 1 - dFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, density[dFrame].fb);

        gl.useProgram(diffuseShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density[1-dFrame].cb);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(diffuseAttrib);
        gl.vertexAttribPointer(diffuseAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(diffuseUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(diffuseUniforms.texture, 0);
        gl.uniform2f(diffuseUniforms.resolution, frameWidth, frameHeight);
        gl.uniform1f(diffuseUniforms.re, Re);
        gl.uniform1f(diffuseUniforms.dt, dt);
        gl.uniform1f(diffuseUniforms.h, h);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        densityBoundary();

        // インク場の計算(2) : 移流項
        // calculate the dencity field (2) : advect
        dFrame = 1 - dFrame;
        gl.bindFramebuffer(gl.FRAMEBUFFER, density[dFrame].fb);

        gl.useProgram(advectShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity[vFrame].cb);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density[1-dFrame].cb);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(advectAttrib);
        gl.vertexAttribPointer(advectAttrib, 2, gl.FLOAT, false, 0, 0);
        
        gl.uniformMatrix4fv(advectUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(advectUniforms.velocity, 0);
        gl.uniform1i(advectUniforms.texture, 1);
        gl.uniform2f(advectUniforms.resolution, frameWidth, frameHeight);
        gl.uniform1f(advectUniforms.dt, dt);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        densityBoundary();
        
        // シーンの描画
        // draw the scene
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(displayShader);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure[pFrame].cb);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(displayAttrib);
        gl.vertexAttribPointer(displayAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.uniformMatrix4fv(displayUniforms.modelviewMatrix, false, mvpMatrix);
        gl.uniform1i(displayUniforms.texture, 0);
        gl.uniform2f(displayUniforms.resolution, width, height);
        gl.uniform2f(displayUniforms.objPos, objX * width, objY * height);
        gl.uniform1f(displayUniforms.objSize, objSize * height);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        // 再描画
        // redraw
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}


function initFrame(width, height) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    const cb = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cb);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cb, 0);

    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {fb, cb, rb};
}


function initShader(vertSource, fragSource) {
    const vertShader = gl.createShader(gl.VERTEX_SHADER);
    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);

    gl.shaderSource(vertShader, vertSource);
    gl.shaderSource(fragShader, fragSource);

    gl.compileShader(vertShader);
    gl.compileShader(fragShader);
    
    if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the vertex shader: ' + gl.getShaderInfoLog(vertShader));
        gl.deleteShader(vertShader);
        return null;
    }

    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the fragment shader: ' + gl.getShaderInfoLog(fragShader));
        gl.deleteShader(fragShader);
        return null;
    }
    
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertShader);
    gl.attachShader(shaderProgram, fragShader);
    gl.linkProgram(shaderProgram);

    return shaderProgram;
}
