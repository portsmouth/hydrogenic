
/**
 * Namespace for webGL utility wrappers.
 * Functions for loading shader uniform variables are exposed to the user
 * for convenience.
 * @namespace GLU
 */
var GLU = {};

(function() {

    ///////////////////////////////////////////////////
    // GLU namespace functions
    ///////////////////////////////////////////////////

    this.setupGL = function()
    {
        try
        {
            var gl = this.canvas.getContext("webgl2", {preserveDrawingBuffer: true});
        } catch (e) {}
        if (!gl) this.fail("Could not initialise WebGL");
        this.gl = gl;

        //console.log('Supported webGL extensions: ' + gl.getSupportedExtensions());
        this.floatBufExt = gl.getExtension("EXT_color_buffer_float");
        this.floatLinExt = gl.getExtension("OES_texture_float_linear");
        if (!this.floatBufExt || !this.floatLinExt) this.fail("Your platform does not support float textures");
    }

    this.glTypeSize = function(type)
    {
        switch (type)
        {
            case gl.BYTE:
            case gl.UNSIGNED_BYTE:
                return 1;
            case gl.SHORT:
            case gl.UNSIGNED_SHORT:
                return 2;
            case gl.INT:
            case gl.UNSIGNED_INT:
            case gl.FLOAT:
                return 4;
            default:
                return 0;
        }
    }

    function addLineNumbers(string, fs) {
        var lines = string.split( '\n' );
        for ( var i = 0; i < lines.length; i ++ ) {
            let num = i+1;
            lines[ i ] = num.toString().fontcolor("blue").bold() + ': ' + lines[ i ];
        }
        return lines.join( '\t\n' ).fontsize(fs);
    }

    // We assume here a global Shaders object has been defined, which
    // maps names like foo-vertex-shader, foo-fragment-shader to the respective code for shader name foo.
    this.resolveShaderSource = function(shaderDescriptors)
    {
        let shaderSources = {};

        for (let name in shaderDescriptors) 
        {
            let shader_files = shaderDescriptors[name];
            let vertex_shader_file = shader_files.v;
            shaderSources[name] = {}
            shaderSources[name].v = Shaders[vertex_shader_file]

            let fragment_shader_files = shader_files.f;
            if (fragment_shader_files instanceof Array)
            {
                shaderSources[name].f = []
                for (let i=0; i<fragment_shader_files.length; i++)
                {
                    let fs_file = fragment_shader_files[i];
                    let fs_source = Shaders[fs_file];
                    shaderSources[name].f.push(fs_source);
                }
            }
            else
            {
                let fs_source = Shaders[fragment_shader_files];
                shaderSources[name].f = fs_source;
            }
        }
        return shaderSources;
    }

    this.createProgram = function(vertexShader, fragmentShaders, vertSource, fragSource)
    {
        // Here fragmentShaders is either a single shader, or an array of shaders to link

        // create a program.
        var program = gl.createProgram();

        // attach the shaders.
        gl.attachShader(program, vertexShader);

        if (fragmentShaders instanceof Array)
        {
            for (let i=0; i<fragmentShaders.length; i++)
            {
                let fragmentShader = fragmentShaders[i];
                gl.attachShader(program, fragmentShader);
            }
        }
        else
        {
            gl.attachShader(program, fragmentShaders);
        }
        
        // link the program.
        gl.linkProgram(program);

        // Check if it linked.
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!success)
        {
            // something went wrong with the link
            let errMsg = "Program failed to link: ".bold().fontcolor("red") + gl.getProgramInfoLog(program) +
            "\n" + gl.getShaderInfoLog(fragmentShader) +
            "\n" + gl.getShaderInfoLog(vertexShader)

            errMsg += "\n\nProblematic shaders:\n\nVERTEX_SHADER:\n".bold().fontcolor("red") + addLineNumbers(vertSource)
                    +"\n\nFRAGMENT_SHADER:\n".bold().fontcolor("red") + addLineNumbers(fragSource);
                    
            this.fail(errMsg);
        }

        return program;
    }

    this.compileShaderSource = function(shaderName, shaderSource, shaderType)
    {
        var shader = gl.createShader(shaderType); // Create the shader object
        gl.shaderSource(shader, shaderSource); // Set the shader source code.
        gl.compileShader(shader);              // Compile the shader
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS); // Check if it compiled
        if (!success)
        {
            // Something went wrong during compilation; get the error
            var shaderTypeStr = (shaderType==gl.VERTEX_SHADER) ? 'vertex' : 'fragment';
            let errMsg = "Could not compile ".bold() + shaderName.bold() + " " + shaderTypeStr.bold() + " shader: \n\n".bold();
            let glErr = gl.getShaderInfoLog(shader).bold().fontcolor("red");
            glErr = glErr.replace(/^/gm, "\t");
            errMsg += glErr;
            errMsg += "\nProblematic shader:\n\n" + addLineNumbers(shaderSource, 1);
            this.fail(errMsg);
        }
        return shader;
    }

    this.applyShaderReplacements = function(source, replacements)
    {
        let source_ = (' ' + source).slice(1);
        for (var pattern in replacements)
        {
            if (replacements.hasOwnProperty(pattern))
            {
                source_ = source_.replace(new RegExp(pattern, 'g'), replacements[pattern]);
            }
        }
        return source_;
    }

    ///////////////////////////////////////////////////
    // GLU.Shader object
    ///////////////////////////////////////////////////

    /**
    * Represents a webGL vertex or fragment shader:
    * @constructor
    * @memberof GLU
    */
    this.Shader = function(name, shaderSources, replacements)
    {
        let shader_sources = shaderSources[name];
        let vertSource = shader_sources.v;
        let fragSource = shader_sources.f; // could be an array

        // Apply any string replacements to all sources
        if (replacements != null)
        {
            vertSource = GLU.applyShaderReplacements(vertSource, replacements);
            if (fragSource instanceof Array)
            {
                let fragSourceReplacement = []
                for (let i=0; i<fragSource.length; i++)
                {
                    let fs = fragSource[i];
                    fs = GLU.applyShaderReplacements(fs, replacements);
                    fragSourceReplacement.push(fs);
                }
                fragSource = fragSourceReplacement;
            }
            else
            {
                fragSource = GLU.applyShaderReplacements(fragSource, replacements);
            }
        };

        // Compile vertex shader and one or more fragment shaders
        var vertexShader = GLU.compileShaderSource(name, vertSource, gl.VERTEX_SHADER);
        let fragmentShaders = null;
        if (fragSource instanceof Array)
        {
            fragmentShaders = [];
            for (let i=0; i<fragSource.length; i++)
            {
                let fs = GLU.compileShaderSource(name, fragSource[i], gl.FRAGMENT_SHADER);
                fragmentShaders.push(fs);
            }
        }
        else
        {
            fragmentShaders = GLU.compileShaderSource(name, fragSource, gl.FRAGMENT_SHADER);
        }
        
        // Link shaders
        this.program = GLU.createProgram(vertexShader, fragmentShaders, vertSource, fragSource);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            alert("Could not initialise shaders");
        this.uniforms = {};
    }

    this.Shader.prototype.bind = function()
    {
        gl.useProgram(this.program);
    }

    /**
    * Access the underlying webGL program object
    * @returns {WebGLProgram} - the underlying webGL program object for this shader
    */
    this.Shader.prototype.getProgram = function()
    {
        return this.program;
    }

    this.Shader.prototype.getAttribLocation = function(attribName)
    {
        return gl.getAttribLocation(this.program, attribName);
    }

    this.Shader.prototype.getUniformLocation = function(uniformName)
    {
        return gl.getUniformLocation(this.program, uniformName);
    }

    this.Shader.prototype.uniformIndex = function(name)
    {
        if (!(name in this.uniforms))
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        return this.uniforms[name];
    }

    this.Shader.prototype.uniformTexture = function(name, texture)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1i(id, texture.boundUnit);
    }

    /** Provide an integer (via uniform1i) to the currently bound shader
    * @memberof GLU.this.Shader
    * @method uniformI
    * @param {string} name - The name of the uniform variable
    * @param {number} i - The integer value
    */
    this.Shader.prototype.uniformI = function(name, i)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1i(id, i);
    }

    /** Provide a float (via uniform1f) to the currently bound shader
    * @memberof GLU.this.Shader
    * @method uniformF
    * @param {string} name - The name of the uniform variable
    * @param {number} f - The float value
    */
    this.Shader.prototype.uniformF = function(name, f)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1f(id, f);
    }

    /** Provide a vec2 uniform (via uniform2f) to the currently bound shader
    * @memberof GLU.this.Shader
    * @method uniform2F
    * @param {string} name - The name of the uniform variable
    * @param {number} f1 - The first float value
    * @param {number} f2 - The second float value
    */
    this.Shader.prototype.uniform2F = function(name, f1, f2)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform2f(id, f1, f2);
    }

    /** Provide an array of floats (via uniform1Fv) to the currently bound shader
    *   i.e. the shader declares e.g. `uniform float values[19];`
    * @memberof GLU.this.Shader
    * @method uniform1Fv
    * @param {string} name - The name of the uniform variable
    * @param {Float32Array} fvec - An array of floats
    */
    this.Shader.prototype.uniform1Fv = function(name, fvec)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1fv(id, fvec);
    }

    /** Provide an array of vec2 (via uniform2fv) to the currently bound shader
    *   i.e. the shader declares e.g. `uniform vec2 vectors[19];`
    * @memberof GLU.this.Shader
    * @method uniform2Fv
    * @param {string} name - The name of the uniform variable
    * @param {Float32Array} fvec2 - An array of floats, 2 per vector
    */
    this.Shader.prototype.uniform2Fv = function(name, fvec2)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform2fv(id, fvec2);
    }

    /** Provide a vec3 uniform (via uniform3f) to the currently bound shader
    * @memberof GLU.this.Shader
    * @method uniform3F
    * @param {string} name - The name of the uniform variable
    * @param {number} f1 - The first float value
    * @param {number} f2 - The second float value
    * @param {number} f3 - The third float value
    */
    this.Shader.prototype.uniform3F = function(name, f1, f2, f3)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform3f(id, f1, f2, f3);
    }

    /** Provide an array of vec3 (via uniform3fv) to the currently bound shader
    *   i.e. the shader declares e.g. `uniform vec3 vectors[19];`
    * @memberof GLU.this.Shader
    * @method uniform3Fv
    * @param {string} name - The name of the uniform variable
    * @param {Float32Array} fvec3 - An array of floats, 3 per vector
    */
    this.Shader.prototype.uniform3Fv = function(name, fvec3)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform3fv(id, fvec3);
    }

    /** Provide a vec4 uniform (via uniform4F) to the currently bound shader
    * @memberof GLU.this.Shader
    * @method uniform4F
    * @param {string} name - The name of the uniform variable
    * @param {number} f1 - The first float value
    * @param {number} f2 - The second float value
    * @param {number} f3 - The third float value
    * @param {number} f4 - The fourth float value
    */
    this.Shader.prototype.uniform4F = function(name, f1, f2, f3, f4)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform4F(id, f1, f2, f3, f4);
    }

    /** Provide an array of vec4 (via uniform4fv) to the currently bound shader
    *   i.e. the shader declares e.g. `uniform vec4 vectors[19];`
    * @memberof GLU.this.Shader
    * @method uniform4Fv
    * @param {string} name - The name of the uniform variable
    * @param {Float32Array} fvec4 - An array of floats, 4 per vector
    */
    this.Shader.prototype.uniform4Fv = function(name, fvec4)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform4fv(id, fvec4);
    }

    /** Provide a matrix (via uniformMatrix4fv) to the currently bound shader
    *  i.e. the shader declares e.g. `uniform mat4 matrix;`
    * @memberof GLU.this.Shader
    * @method uniformMatrix4fv
    * @param {string} name - The name of the uniform variable
    * @param {Float32Array} matrixArray16 - An array of 16 floats
    */
    this.Shader.prototype.uniformMatrix4fv = function(name, matrixArray16)
    {
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniformMatrix4fv(id, false, matrixArray16);
    }

    ///////////////////////////////////////////////////
    // GLU.VertexBuffer object
    ///////////////////////////////////////////////////

    this.VertexBuffer = function()
    {
        this.attributes = [];
        this.elementSize = 0;
    }

    this.VertexBuffer.prototype.bind = function()
    {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glName);
    }

    this.VertexBuffer.prototype.delete = function()
    {
        gl.deleteBuffer(this.glName);
    }
    
    this.VertexBuffer.prototype.addAttribute = function(name, size, type, norm)
    {
        this.attributes.push({
            "name": name,
            "size": size,
            "type": type,
            "norm": norm,
            "offset": this.elementSize,
            "index": -1
        });
        this.elementSize += size*GLU.glTypeSize(type);
    }

    this.VertexBuffer.prototype.init = function(numVerts)
    {
        this.length = numVerts;
        this.glName = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glName);
        gl.bufferData(gl.ARRAY_BUFFER, this.length*this.elementSize, gl.STATIC_DRAW);
    }

    this.VertexBuffer.prototype.copy = function(data)
    {
        if (data.byteLength != this.length*this.elementSize)
        {
            throw new Error("Resizing VBO during copy strongly discouraged");
        }
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    this.VertexBuffer.prototype.draw = function(shader, mode, length)
    {
        for (var i = 0; i < this.attributes.length; ++i)
        {
            this.attributes[i].index = gl.getAttribLocation(shader.program, this.attributes[i].name);
            if (this.attributes[i].index >= 0)
            {
                var attr = this.attributes[i];
                gl.enableVertexAttribArray(attr.index);
                gl.vertexAttribPointer(attr.index, attr.size, attr.type, attr.norm, this.elementSize, attr.offset);
            }
        }

        gl.drawArrays(mode, 0, length ? length : this.length);

        for (var i = 0; i < this.attributes.length; ++i)
        {
            if (this.attributes[i].index >= 0)
            {
                gl.disableVertexAttribArray(this.attributes[i].index);
                this.attributes[i].index = -1;
            }
        }
    }


    ///////////////////////////////////////////////////
    // GLU.Texture object
    ///////////////////////////////////////////////////

    this.Texture = function(width, height, channels, isFloat, isLinear, isClamped, texels)
    {
        this.width  = width;
        this.height = height;
        this.coordMode = isClamped ? gl.CLAMP_TO_EDGE : gl.REPEAT;
        this.type      = isFloat   ? gl.FLOAT         : gl.UNSIGNED_BYTE;
        this.internalformat   = [gl.R32F, gl.RG, gl.RGB, gl.RGBA32F][channels - 1];
        this.format           = [gl.RED, gl.RG, gl.RGB, gl.RGBA][channels - 1];

        this.interpMode = isLinear ? gl.LINEAR : gl.NEAREST;

        this.glName = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.glName);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.internalformat, this.width, this.height, 0, this.format, this.type, texels);
        
        if (texels !== null) this.setFilter();
        this.boundUnit = -1;
    }

    this.Texture.prototype.copy = function(texels)
    {
        gl.texImage2D(gl.TEXTURE_2D, 0, this.internalformat, this.width, this.height, 0, this.format, this.type, texels);
        if (texels !== null) this.setFilter();
    }

    this.Texture.prototype.setFilter = function()
    {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.coordMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.coordMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.interpMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.interpMode);
    }

    this.Texture.prototype.bind = function(unit)
    {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.glName);
        this.boundUnit = unit;
    }

    /* Loads a texture. Input sRGB images are automatically converted into linear space.
    * @memberof GLU.this.Texture
        * @method uniform3F
        * @param {string} url - URL of the texture to load
        * @param {Object} callback - function to call on texture load
        * @returns {Object} - returns a texture info object: { width: w, height: h, texture: gl-tex }
    */
    this.loadImageAndCreateTextureInfo = function(url, callback)
    {
        let tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
        let imgInfo = {
            width: 1,   // we don't know the size until it loads
            height: 1,
            texture: tex,
            url: url,
        };
        let img = new Image();
        img.addEventListener('load', function() {
            imgInfo.width = img.width;
            imgInfo.height = img.height;
            imgInfo.url = url;
            imgInfo.tex = tex;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            callback(imgInfo);
        });
        img.crossOrigin = "";
        img.src = url;
        return imgInfo;
    }

    ///////////////////////////////////////////////////
    // GLU.RenderTarget object
    ///////////////////////////////////////////////////

    this.RenderTarget = function()
    {
        this.glName = gl.createFramebuffer();
    }

    this.RenderTarget.prototype.bind = function()
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glName);
    }

    this.RenderTarget.prototype.unbind = function()
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    this.RenderTarget.prototype.attachTexture = function(texture, index)
    {
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture.glName, 0);
    }

    this.RenderTarget.prototype.detachTexture = function(index)
    {
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, null, 0);
    }

    this.RenderTarget.prototype.drawBuffers = function(numBufs)
    {
        var buffers = [];
        for (var i = 0; i<numBufs; ++i)
            buffers.push(gl.COLOR_ATTACHMENT0 + i);
        gl.drawBuffers(buffers);
    }


    ///////////////////////////////////////////////////
    // GLU logic
    ///////////////////////////////////////////////////

    this.fail = function(message)
    {
        var sorryP = document.createElement("p");
        sorryP.appendChild(document.createTextNode("[Hydrogenic] error occurred:"));
        sorryP.style.fontSize = "32px";
        sorryP.style.font = "bold 24px arial,serif";
        sorryP.style.color = 'red';

        var debug = document.createElement("div");
        debug.id = "debugger";
        debug.scrollTop = debug.scrollHeight;
        debug.innerHTML = '<pre>' + '    ' + message + '</pre>';

        var failureDiv = document.createElement("div");
        failureDiv.className = "center";
        failureDiv.appendChild(sorryP);
        failureDiv.appendChild(debug);

        document.getElementById("container").appendChild(failureDiv);
        this.canvas.style.display = 'none';

        hydrogenic.terminated = true;
        throw new Error("Terminating Hydrogenic");
    }

    // Create CSS rules for the document contents
    let style = document.createElement("style");
    style.appendChild(document.createTextNode("")); // WebKit hack :(
    document.head.appendChild(style);
    let sheet = window.document.styleSheets[0];

    sheet.insertRule(`body{
  margin: 0px;
  overflow: hidden;
}`, sheet.cssRules.length);

    sheet.insertRule(`#container {
    position: relative;
    margin: 0px;
    padding: 0px;
}`, sheet.cssRules.length);

    sheet.insertRule(`#textContainer {
    position: absolute;
    margin: 0px;
    overflow: hidden;
    left: 0px;
    top: 0px;
    pointer-events: none;
    z-index: 1;
}`, sheet.cssRules.length);

    sheet.insertRule(`#gui {
    position: absolute;
    z-index: 100;
    right: 0px;
}`, sheet.cssRules.length);

    sheet.insertRule(`#debugger {
        position: relative;
        z-index: 5;
        right: 10px;
        margin: 10px;
        overflow: scroll;
        height: 100vh;
        width: 95vw;
        font-family: Verdana, Tahoma, Arial, Helvetica, sans-serif;
        left: 0px;
        top: 0px;
    }`, sheet.cssRules.length);

    // Create here the DOM elements for renderer and text canvas
    var container = document.createElement("div");
    container.id = "container";
    document.body.appendChild(container);

    var render_canvas = document.createElement('canvas');
    render_canvas.id = "render-canvas";
    render_canvas.width  = window.innerWidth;
    render_canvas.height = window.innerHeight;
    container.appendChild(render_canvas);
    this.canvas = render_canvas;

    var textContainer = document.createElement("div");
    textContainer.id = "textContainer";
    container.appendChild(textContainer);

    var text_canvas = document.createElement('canvas');
    text_canvas.id = "text-canvas";
    textContainer.appendChild(text_canvas);

    try
    {
        this.setupGL();
    }
    catch (e)
    {
        this.fail(e.message + ". This can't run in your browser.");
        return;
    }

    var gl = this.gl;

}).apply(GLU);
