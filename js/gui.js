
function hexToRgb(hex) 
{
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

var GUI = function(visible = true)
{
    // Create dat gui
    this.gui = new dat.GUI();
    this.gui.domElement.id = 'gui';
    var gui = this.gui;
    this.guiSettings = {};
    this.visible = visible;

    var renderer = hydrogenic.getRenderer();
    var camera = hydrogenic.getCamera();

    let item = this.gui.add(hydrogenic, 'n', hydrogenic.n_options);
    item.onChange( function(value) { hydrogenic.reset(); } );    
    item = this.gui.add(hydrogenic, 'orbital', hydrogenic.orbital_options);
    item.onChange( function(value) { hydrogenic.reset(); } );

    item = this.gui.add(renderer, 'density', 0.0, 1.0);
    item = this.gui.add(renderer, 'emission', 0.0, 1.0);
    item = this.gui.add(renderer, 'frequency', 0.0, 100.0);
    item = this.gui.add(renderer, 'radialScale', 0.0, 0.1);
    item.onChange( function(value) { hydrogenic.reset(); } );

    // camera folder
    this.cameraFolder = this.gui.addFolder('Camera');
    this.cameraFolder.add(camera, 'fov', 5.0, 120.0).onChange( function(value) { renderer.reset(true); } );
    this.cameraFolder.close();
    
    // renderer folder
    this.rendererFolder = this.gui.addFolder('Renderer');
    this.rendererFolder.add(renderer, 'maxMarchSteps', 16, 1024, 1).onChange( function(value) { renderer.maxMarchSteps = Math.floor(value); renderer.reset(); } );
    this.rendererFolder.add(renderer, 'exposure', -5.0, 15.0);
    this.rendererFolder.add(renderer, 'show_axes', false);
    this.rendererFolder.add(renderer, 'contrast', 0.0, 3.0);
    this.rendererFolder.add(renderer, 'saturation', 0.0, 3.0);
    item = this.rendererFolder.add(hydrogenic, 'colormap', hydrogenic.colormaps);
    item.onChange( function(value) { hydrogenic.reset(); } );

    this.guiSettings.bgColor = [renderer.bgColor[0]*255.0, 
                                renderer.bgColor[1]*255.0, 
                                renderer.bgColor[2]*255.0];
    this.rendererFolder.addColor(this.guiSettings, 'bgColor').onChange( function(value) 
    { 
        if (typeof value==='string' || value instanceof String)
        {
        var color = hexToRgb(value);
        renderer.bgColor[0] = color.r / 255.0;
        renderer.bgColor[1] = color.g / 255.0;
        renderer.bgColor[2] = color.b / 255.0;
        }
        else
        {
        renderer.bgColor[0] = value[0] / 255.0;
        renderer.bgColor[1] = value[1] / 255.0;
        renderer.bgColor[2] = value[2] / 255.0;
        }
        renderer.reset(true);
    });

    this.rendererFolder.close();

    if (!visible)
        this.gui.__proto__.constructor.toggleHide();
}

function updateDisplay(gui)
{
    for (var i in gui.__controllers) {
        gui.__controllers[i].updateDisplay();
    }
    for (var f in gui.__folders) {
        updateDisplay(gui.__folders[f]);
    }
}

GUI.prototype.sync = function()
{
    updateDisplay(this.gui);
}

GUI.prototype.toggleHide = function()
{
    this.visible = !this.visible;
}


GUI.prototype.getGUI = function()
{
    return this.gui;
}
