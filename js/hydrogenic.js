

var Hydrogenic = function()
{
    this.initialized = false;
    this.terminated = false;
    this.rendering = false;
    hydrogenic = this;

    let container = document.getElementById("container");
    this.container = container;
    var render_canvas = document.getElementById('render-canvas');
    this.render_canvas = render_canvas;
    this.width = render_canvas.width;
    this.height = render_canvas.height;
    render_canvas.style.width = render_canvas.width;
    render_canvas.style.height = render_canvas.height;

    var text_canvas = document.getElementById('text-canvas');
    this.text_canvas = text_canvas;
    this.textCtx = text_canvas.getContext("2d");
    this.onAppLink = false;
    this.onUserLink = false;
    this.statusText = '';

    window.addEventListener( 'resize', this, false );

    // Setup THREE.js orbit camera
    var VIEW_ANGLE = 45; // @todo: fov should be under user control
    var ASPECT = this.width / this.height;
    var NEAR = 0.05;
    var FAR = 1000;

    this.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
    this.camera.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
    this.camera.position.set(1.8, 0.0, 0.0);
    this.camera.up.set(0.0, 0.0, 1.0);
    this.camControls = new THREE.OrbitControls(this.camera, this.container);
    this.camControls.target.set(0.0, 0.0, 0.0);
    this.camControls.zoomSpeed = 2.0;
    this.camControls.flySpeed = 0.01;
    this.camControls.addEventListener('change', camChanged);
    this.camControls.keyPanSpeed = 100.0;
    this.gui = null;
    this.guiVisible = true;

    // Setup orbital selections
    hydrogenic.n_options = ['1', '2', '3', '4'];
    hydrogenic.orbital_options = ['s', 
                                  'p1', 'p0', 'px', 'py', 'pz',
                                  'd2', 'd1', 'd0', 'd[z2]', 'd[xz]', 'd[yz]', 'd[xy]', 'd[x2-y2]',
                                  'f3', 'f2', 'f1', 'f0', 'f[z3]', 'f[xz2]', 'f[yz2]', 'f[xyz]', 'f[z(x2-y2)', 'f[x(x2-3y2)]', 'f[y(3x2-y2)]'];
    hydrogenic.n = 4;
    hydrogenic.orbital = 's';
    hydrogenic.interatomic = 3.0;
    hydrogenic.amplitude1 = 1.0;
    hydrogenic.amplitude2 = 1.0;
    hydrogenic.amplitude3 = 1.0;
    hydrogenic.amplitude4 = 1.0;
    hydrogenic.phase1     = 0.0;
    hydrogenic.phase2     = Math.PI*0.5;
    hydrogenic.phase3     = Math.PI;
    hydrogenic.phase4     = Math.PI*1.5;
    hydrogenic.colormaps = Object.keys(colormaps);
    hydrogenic.colormap = 'jet';

    // Instantiate renderer
    this.renderer = new Renderer();
    this.auto_resize = true;
    this.init();

    // Create dat gui
    this.gui = new GUI(this.guiVisible);

    // Do initial resize:
    this.resize();

    // Setup keypress and mouse events
    window.addEventListener( 'mousemove', this, false );
    window.addEventListener( 'mousedown', this, false );
    window.addEventListener( 'mouseup',   this, false );
    window.addEventListener( 'contextmenu',   this, false );
    window.addEventListener( 'click', this, false );
    window.addEventListener( 'keydown', this, false );

    this.reset_time = performance.now();
    this.initialized = true;
}

/**
* Returns the current version number of the system, in the format [1, 2, 3] (i.e. major, minor, patch version)
*  @returns {Array}
*/
Hydrogenic.prototype.getVersion = function()
{
    return [1, 0, 0];
}

Hydrogenic.prototype.handleEvent = function(event)
{
    switch (event.type)
    {
        case 'resize':      this.resize();  break;
        case 'mousemove':   this.onDocumentMouseMove(event);  break;
        case 'mousedown':   this.onDocumentMouseDown(event);  break;
        case 'mouseup':     this.onDocumentMouseUp(event);    break;
        case 'click':       this.onClick(event);  break;
        case 'keydown':     this.onkeydown(event);  break;
    }
}

/**
* Access to the Renderer object
*  @returns {Renderer}
*/
Hydrogenic.prototype.getRenderer = function()
{
    return this.renderer;
}

/**
* Access to the GUI object
*  @returns {GUI}
*/
Hydrogenic.prototype.getGUI = function()
{
    return this.gui;
}

/**
* Access to the camera object
* @returns {THREE.PerspectiveCamera}.
*/
Hydrogenic.prototype.getCamera = function()
{
    return this.camera;
}

/**
* Access to the camera controller object
* @returns {THREE.OrbitControls}
*/
Hydrogenic.prototype.getControls = function()
{
    return this.camControls;
}

/**
* Programmatically show or hide the dat.GUI UI
* @param {Boolean} show - toggle
*/
Hydrogenic.prototype.showGUI = function(show)
{
    this.guiVisible = show;
}

/**
* Specify arbitrary status text (one line only) to display in the lower right of the viewport
* @param {Boolean} statusText - text to display
*/
Hydrogenic.prototype.setStatus = function(statusText)
{
    this.statusText = statusText;
}

//
// Scene management
//

Hydrogenic.prototype.getScene = function()
{
    return this.sceneObj;
}

/**
 * @returns {WebGLRenderingContext} The webGL context
 */
Hydrogenic.prototype.getGLContext = function()
{
    return GLU.gl;
}


Hydrogenic.prototype.init = function()
{
    // cache initial camera position to allow reset on 'F'
    this.initial_camera_position = new THREE.Vector3();
    this.initial_camera_position.copy(this.camera.position);
    this.initial_camera_target = new THREE.Vector3();
    this.initial_camera_target.copy(this.camControls.target);

    // Compile GLSL shaders
    this.renderer.compileShaders();

    // Fix renderer to width & height, if they were specified
    if ((typeof this.renderer.width!=="undefined") && (typeof this.renderer.height!=="undefined"))
    {
        this.auto_resize = false;
        this._resize(this.renderer.width, this.renderer.height);
    }

    // Camera setup
    this.camControls.update();
    this.reset(false);
}


// Renderer reset on camera or other parameters update
Hydrogenic.prototype.reset = function(no_recompile = false)
{
    if (!this.initialized || this.terminated) return;
    this.reset_time = performance.now();
    this.renderer.reset(no_recompile);
}
   
// Render all
Hydrogenic.prototype.render = function()
{
    if (!this.initialized || this.terminated) return;

    this.rendering = true;
    this.renderer.render();

    // Update HUD text canvas
    this.textCtx.textAlign = "left";   	// This determines the alignment of text, e.g. left, center, right
    this.textCtx.textBaseline = "middle";	// This determines the baseline of the text, e.g. top, middle, bottom
    this.textCtx.font = '12px monospace';	// This determines the size of the text and the font family used
    this.textCtx.clearRect(0, 0, this.textCtx.canvas.width, this.textCtx.canvas.height);
    this.textCtx.globalAlpha = 0.95;
    this.textCtx.strokeStyle = 'black';
    this.textCtx.lineWidth  = 2;
    if (this.guiVisible)
    {
          if (this.onAppLink) this.textCtx.fillStyle = "#ff5500";
          else                   this.textCtx.fillStyle = "#ffff00";
          let ver = this.getVersion();
          this.textCtx.strokeText('Hydrogenic v'+ver[0]+'.'+ver[1]+'.'+ver[2], 14, 20);
          this.textCtx.fillText('Hydrogenic v'+ver[0]+'.'+ver[1]+'.'+ver[2], 14, 20);
    }

    this.rendering = false;
}

Hydrogenic.prototype._resize = function(width, height)
{
    this.width = width;
    this.height = height;

    let render_canvas = this.render_canvas;
    render_canvas.width  = width;
    render_canvas.height = height;
    render_canvas.style.width = width;
    render_canvas.style.height = height;

    var text_canvas = this.text_canvas;
    text_canvas.width  = width;
    text_canvas.height = height

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camControls.update();

    this.renderer.resize(width, height);
}

Hydrogenic.prototype.resize = function()
{
    if (this.terminated) return;
    if (this.auto_resize)
    {
        // If no explicit renderer size was set by user, resizing the browser window
        // resizes the render itself to match.
        let width = window.innerWidth;
        let height = window.innerHeight;
        this._resize(width, height);
        if (this.initialized)
            this.render();
    }
    else
    {
        // Otherwise if the user set a fixed renderer resolution, we scale the resultant render
        // to fit into the current window with preserved aspect ratio:
        let render_canvas = this.render_canvas;
        let window_width = window.innerWidth;
        let window_height = window.innerHeight;
        let render_aspect = render_canvas.width / render_canvas.height;
        let window_aspect = window_width / window_height;
        if (render_aspect > window_aspect)
        {
            render_canvas.style.width = window_width;
            render_canvas.style.height = window_width / render_aspect;
        }
        else
        {
            render_canvas.style.width = window_height * render_aspect;
            render_canvas.style.height = window_height;
        }
        var text_canvas = this.text_canvas;
        text_canvas.width = window_width;
        text_canvas.height = window_height;
    }
}


/**
*
* @returns {number} - the minimum texture unit for user supplied textures in the shader
*/
Hydrogenic.prototype.getUserTextureUnitStart = function()
{
    return 7;
}

Hydrogenic.prototype.onClick = function(event)
{
    if (this.onAppLink)
    {
        window.open("https://github.com/portsmouth/hydrogenic");
    }
    if (this.onUserLink)
    {
        window.open(this.sceneURL);
    }
    event.preventDefault();
}

Hydrogenic.prototype.onDocumentMouseMove = function(event)
{
    // Check whether user is trying to click the home link, or user link
    var textCtx = this.textCtx;
    var x = event.pageX;
    var y = event.pageY;
    let linkWidth = this.textCtx.measureText('Hydrogenic vX.X.X').width;
    if (x>14 && x<14+linkWidth && y>15 && y<25) this.onAppLink = true;
    else this.onAppLink = false;
    if (this.sceneURL != '')
    {
        linkWidth = this.textCtx.measureText(this.sceneURL).width;
        if (x>14 && x<14+linkWidth && y>this.height-45 && y<this.height-35) this.onUserLink = true;
        else this.onUserLink = false;
    }

    this.camControls.update();
}

Hydrogenic.prototype.onDocumentMouseDown = function(event)
{
    this.camControls.update();
}

Hydrogenic.prototype.onDocumentMouseUp = function(event)
{
    this.camControls.update();
}

Hydrogenic.prototype.onkeydown = function(event)
{
    var charCode = (event.which) ? event.which : event.keyCode;
    switch (charCode)
    {
        case 122: // F11 key: go fullscreen
            var element	= document.body;
            if      ( 'webkitCancelFullScreen' in document ) element.webkitRequestFullScreen();
            else if ( 'mozCancelFullScreen'    in document ) element.mozRequestFullScreen();
            else console.assert(false);
            break;

        case 70: // F key: reset cam
            this.camera.position.copy(this.initial_camera_position);
            this.camControls.target.copy(this.initial_camera_target);
            this.reset(true);
            break;

        case 72: // H key: toggle hide/show dat gui
            this.guiVisible = !this.guiVisible;
            hydrogenic.getGUI().toggleHide();
            break;
        
        case 80: // P key: save current image to disk
        {
            var currentdate = new Date(); 
            var datetime = currentdate.getDate() + "-" + (currentdate.getMonth()+1)  + "-" + currentdate.getFullYear() + "_"  
                         + currentdate.getHours() + "-" + currentdate.getMinutes() + "-" + currentdate.getSeconds();
            let filename = `hydrogenic-screenshot-${datetime}.png`;
            let link = document.createElement('a');
            link.download = filename;
            this.render_canvas.toBlob(function(blob){
                    link.href = URL.createObjectURL(blob);
                    var event = new MouseEvent('click');
                    link.dispatchEvent(event);
                },'image/png', 1);
            break;
        }
    }
}

function camChanged()
{
    if (!hydrogenic.rendering)
    {
        var no_recompile = true;
        hydrogenic.reset(no_recompile);
    }
}
