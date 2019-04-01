

var Renderer = function()
{
    this.gl = GLU.gl;
    var gl = GLU.gl;

    var render_canvas = hydrogenic.render_canvas;
    render_canvas.width  = window.innerWidth;
    render_canvas.height = window.innerHeight;
    this._width = render_canvas.width;
    this._height = render_canvas.height;

    // Initialize pathtracing buffers and programs
    this.fbo == null;
    this.raymarchProgram = null;
    this.tonemapProgram  = null;

    // Internal properties
    this.time_ms = 0.0;

    // Default user-adjustable properties
    this.maxMarchSteps = 256;
    this.radialScale = 0.02;
    this.density = 0.2;
    this.emission = 0.1
    this.frequency = 10.0;
    this.exposure = 2.0;
    this.contrast = 1.0;
    this.saturation = 1.0;
    this.show_axes = false;
    this.bgColor = [1.0, 1.0, 1.0];

    // Load shaders
    this.shaderSources = GLU.resolveShaderSource({
        'raymarcher': {'v': 'raymarcher-vertex-shader', 'f': 'raymarcher-fragment-shader'},
        'tonemapper': {'v': 'tonemapper-vertex-shader', 'f': 'tonemapper-fragment-shader'},
        'axis':       {'v': 'axis-vertex-shader',       'f': 'axis-fragment-shader'}
    });

    this.tonemapProgram = new GLU.Shader('tonemapper', this.shaderSources, null);
    this.axisProgram = new GLU.Shader('axis', this.shaderSources, {});

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.blendFunc(gl.ONE, gl.ONE);

    this.quadVbo = this.createQuadVbo();
    this.fbo = new GLU.RenderTarget();

    // Trigger initial buffer generation
    this.resize(this._width, this._height);

    this.createAxisVbo();
}

Renderer.prototype.createQuadVbo = function()
{
    var vbo = new GLU.VertexBuffer();
    vbo.addAttribute("Position", 3, this.gl.FLOAT, false);
    vbo.addAttribute("TexCoord", 2, this.gl.FLOAT, false);
    vbo.init(4);
    vbo.copy(new Float32Array([
         1.0,  1.0, 0.0, 1.0, 1.0,
        -1.0,  1.0, 0.0, 0.0, 1.0,
        -1.0, -1.0, 0.0, 0.0, 0.0,
         1.0, -1.0, 0.0, 1.0, 0.0
    ]));
    return vbo;
}


Renderer.prototype.createAxisVbo = function()
{
    let gl = this.gl;
    if (this.axisVbo)
    {
        this.axisVbo.delete();
        this.axisVbo = null;
    }
    this.axisVbo = new GLU.VertexBuffer();
    this.axisVbo.addAttribute("Position", 3, gl.FLOAT, false);
    this.axisVbo.init(6);
    this.axisVbo.copy(new Float32Array([0.0, 0.0, 0.0, this.radialScale, 0.0, 0.0,
                                        0.0, 0.0, 0.0, 0.0, this.radialScale, 0.0,
                                        0.0, 0.0, 0.0, 0.0, 0.0, this.radialScale]));
}

Renderer.prototype.reset = function(no_recompile = false)
{
    this.time_ms = 0.0;
    if (!no_recompile) this.compileShaders();
    var gl = GLU.gl;
    this.fbo.bind();
    this.fbo.drawBuffers(1);
    this.fbo.attachTexture(this.radianceTex, 0);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.fbo.unbind();

    if (this.axisVbo)
    {
        this.axisVbo.delete();
        this.axisVbo = null;
    }
}

Renderer.prototype.compileShaders = function()
{
    replacements = {};

    let n_str = hydrogenic.n;
    let n = parseInt(n_str);
    let l=0;
    let orbital_str = hydrogenic.orbital;
    orbital_str = orbital_str.replace(/ /g,"");
    orbital_str = orbital_str.replace("[", "");
    orbital_str = orbital_str.replace("]", "");
    orbital_str = orbital_str.replace("(", "");
    orbital_str = orbital_str.replace(")", "");
    orbital_str = orbital_str.replace("-", "");
    if      (orbital_str.includes("p")) l=1;
    else if (orbital_str.includes("d")) l=2;
    else if (orbital_str.includes("f")) l=3;
    if (n<=l) n = l+1;
    hydrogenic.n = n;
    let gui = hydrogenic.getGUI();
    if (gui) gui.sync();
    replacements.ORBITAL_FUNC = 'orbital_' + n.toString() + orbital_str;

    replacements.__MAX_MARCH_STEPS__ = Math.round(this.maxMarchSteps);
    replacements.__COLORMAP__ = colormaps[hydrogenic.colormap];
    this.raymarchProgram = new GLU.Shader('raymarcher', this.shaderSources, replacements);
}


Renderer.prototype.render = function()
{
    let timer_start = performance.now();
    let gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    this.raymarchProgram.bind();

    // sync camera info to shader
    var camera = hydrogenic.getCamera();
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    var matrixWorldInverse = new THREE.Matrix4();
    matrixWorldInverse.getInverse( camera.matrixWorld );
    var modelViewMatrix = matrixWorldInverse.toArray();
    var projectionMatrix = camera.projectionMatrix.toArray();
    var camPos = camera.position.clone();
    var camDir = camera.getWorldDirection();
    var camUp = camera.up.clone();
    //camUp.transformDirection( camera.matrixWorld );
    var camX = new THREE.Vector3();
    camX.crossVectors(camUp, camDir);
    camX.normalize();
    camUp.crossVectors(camDir, camX);
    this.raymarchProgram.uniform3Fv("camPos", [camPos.x, camPos.y, camPos.z]);
    this.raymarchProgram.uniform3Fv("camDir", [camDir.x, camDir.y, camDir.z]);
    this.raymarchProgram.uniform3Fv("camX", [camX.x, camX.y, camX.z]);
    this.raymarchProgram.uniform3Fv("camY", [camUp.x, camUp.y, camUp.z]);
    this.raymarchProgram.uniformF("camFovy", camera.fov);
    this.raymarchProgram.uniformF("camAspect", camera.aspect);
    this.raymarchProgram.uniform2Fv("resolution", [this._width, this._height]);
    this.raymarchProgram.uniformF("radialScale", this.radialScale);
    this.raymarchProgram.uniformF("density_scale", this.density);
    this.raymarchProgram.uniformF("emission_scale", this.emission);
    this.raymarchProgram.uniform3Fv("bg_color", this.bgColor);

    let a1 = hydrogenic.amplitude1;
    let a2 = hydrogenic.amplitude2;
    let a3 = hydrogenic.amplitude3;
    let a4 = hydrogenic.amplitude4;
    this.raymarchProgram.uniform2F("phase1", a1*Math.cos(hydrogenic.phase1), a1*Math.sin(hydrogenic.phase1));
    this.raymarchProgram.uniform2F("phase2", a2*Math.cos(hydrogenic.phase2), a2*Math.sin(hydrogenic.phase2));
    this.raymarchProgram.uniform2F("phase3", a3*Math.cos(hydrogenic.phase3), a3*Math.sin(hydrogenic.phase3));
    this.raymarchProgram.uniform2F("phase4", a4*Math.cos(hydrogenic.phase4), a4*Math.sin(hydrogenic.phase4));

    let time_sec = this.time_ms/1.0e3;
    let overall_phase = time_sec * 2.0 * Math.PI * this.frequency * hydrogenic.n;
    this.raymarchProgram.uniform2F("overall_phase", Math.cos(overall_phase), Math.sin(overall_phase));
    //console.log('overall_phase: ', overall_phase);

    // Attach radiance FBO
    this.fbo.bind();
    this.fbo.drawBuffers(1);
    this.fbo.attachTexture(this.radianceTex, 0);

    // Trace one ray per pixel
    gl.disable(gl.BLEND);
    this.quadVbo.bind();
    this.quadVbo.draw(this.raymarchProgram, gl.TRIANGLE_FAN);
    this.fbo.unbind();
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Tonemapping / compositing
    this.tonemapProgram.bind();
    this.radianceTex.bind(0);
    this.tonemapProgram.uniformTexture("Radiance", this.radianceTex);
    this.tonemapProgram.uniformF("exposure", this.exposure);
    this.tonemapProgram.uniformF("contrast", this.contrast);
    this.tonemapProgram.uniformF("saturation", this.saturation);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    this.quadVbo.bind();
    this.quadVbo.draw(this.tonemapProgram, gl.TRIANGLE_FAN);

    // Draw axes
    if (this.show_axes)
    {
        this.createAxisVbo();
        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.axisProgram.bind();
        var projectionMatrixLocation = this.axisProgram.getUniformLocation("u_projectionMatrix");
        gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
        var modelViewMatrixLocation = this.axisProgram.getUniformLocation("u_modelViewMatrix");
        gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
        this.axisProgram.uniform4Fv("color", [1.0, 0.5, 0.5, 0.3]);
        this.axisVbo.draw(this.axisProgram, gl.LINES);
        gl.disable(gl.BLEND);
    }

    var timer_end = performance.now();
    var frame_time_ms = (timer_end - timer_start);
    this.time_ms += frame_time_ms;

    gl.finish();
}

Renderer.prototype.resize = function(width, height)
{
    this._width = width;
    this._height = height;
    this.fbo.unbind();
    var radianceData = new Float32Array(width*height*4); // Path radiance, and sample count
    this.radianceTex = new GLU.Texture(width, height, 4, true, false, true, radianceData);
    this.quadVbo = this.createQuadVbo();
    this.fbo = new GLU.RenderTarget();
    this.reset(true);
}

