/** 
 * Main file that makes all the calls to set up the shaders, buffers, skybox, mesh, and draw
 * 
 * @author      Scott Wolfskill, wolfski2
 * @created     04/10/17
 * @last edit   04/18/17
 */
var gl;
var canvas;

var shaderProgram;

var teapotVertexPosBuf; //vertex position buffer
var teapotIndexBuf;
var teapotNormalBuf; //Create a place to store normals for shading

var skyboxVertexPosBufs;
var skyboxIndexBufs;
var skyboxTCoordBufs;

var skyboxTextures;
var skyboxImages;
var imagesLoaded = false; //true when all images have been loaded

//For reflection mapping:
var cubeMapTexture; //use a cube map only for this part since it seems simplest (didn't work well for skybox)
var reflectionMapping = true;

// View parameters
var eyePt = vec3.fromValues(0.0, 0.0, 10.0); //15 depth
//var eyePt = vec3.fromValues(0.0, 9.5, 0.5); //15 depth
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
var up = vec3.fromValues(0.0,1.0,0.0);
var viewPt = vec3.fromValues(0.0,0.0,0.0);
// Quaternion view params
var quatLR = quat.create(); //rotation moving Left/Right, about the up axis
var eyeQuatUD = quat.create(); //rotation moving Up/Down, about axis perpendicular to up and eyeDir
var rotDegrees = 0.5; //degrees to increment/decrement axis rotation with user controls
var rotDegreesY = 0.0; //total degrees we have currently rotated about the up axis

var teapotRotX = 0.0;
var teapotRotZ = 0.0;

var speed = 0.12; //speed user camera moves forward

var scale = 100; //percent scale of .obj file to load

var mouseDown = false; //true if user has clicked mouse down (and not let up yet)
var lastMousePos; //vec2 representing the last mouse position

// Create ModelView matrix
var mvMatrix = mat4.create();

//Create Projection matrix
var pMatrix = mat4.create();

// Create the Normal matrix
var nMatrix = mat3.create();

//Create Y-Rotation matrix for adjusting reflection vector in shader by where we have rotated camera (eyePt) over Y axis
var rotYMatrix = mat3.create();

var mvMatrixStack = [];

// For animation (from HelloTexture demo, kept for lolz)
var spinnyWorld = false; //true if we want to use this spinning animation (lol)
var then =0;
var modelXRotationRadians = degToRad(0);
var modelYRotationRadians = degToRad(0);

/**
 * Sends Modelview matrix to both shaders.
 */
function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
  gl.uniformMatrix4fv(shaderProgram.fs_mvMatrixUniform, false, mvMatrix);
}

/**
 * Sends projection matrix to both shaders.
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, 
                      false, pMatrix);
}

/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

/**
 * Sends projection/modelview matrices to shader
 */
function setMatrixUniforms() {
    uploadModelViewMatrixToShader();
    uploadProjectionMatrixToShader();
    uploadNormalMatrixToShader();
}

/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} a Ambient light strength
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function uploadLightsToShader(loc,a,d,s) {
	gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
	gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
	gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
	gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

/**
 * Send the skybox boolean to the shaders.
 * @param {bool} skybox True indicates the shaders should draw the skybox; false indicates it should draw the teapot
 */
function uploadSkyboxToShader(skybox) {
    gl.uniform1i(shaderProgram.vsSkyboxUniform, skybox);
    gl.uniform1i(shaderProgram.fsSkyboxUniform, skybox);
}

/**
 * Translates degrees to radians
 * @param {Number} degrees Degree input to function
 * @return {Number} The radians that correspond to the degree input
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

/**
 * Creates a context for WebGL
 * @param {element} canvas WebGL canvas
 * @return {Object} WebGL context
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

/**
 * Loads Shaders
 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);
  // If we don't find an element with the specified id
  // we do an early exit 
  if (!shaderScript) {
    return null;
  }
  
  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
 
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
 
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  } 
  return shader;
}

/**
 * Setup the fragment and vertex shaders
 */
function setupShaders() {
  vertexShader = loadShaderFromDOM("shader-vs");
  fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  
  shaderProgram.texCoordAttribute = gl.getAttribLocation(shaderProgram, "aTexCoord");
  console.log("Tex coord attrib: ", shaderProgram.texCoordAttribute);
  gl.enableVertexAttribArray(shaderProgram.texCoordAttribute);
    
  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  console.log("Vertex attrib: ", shaderProgram.vertexPositionAttribute);
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    
  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  console.log("Normal attrib: ", shaderProgram.vertexNormalAttribute);
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);
    
  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    
    shaderProgram.fs_mvMatrixUniform = gl.getUniformLocation(shaderProgram, "fs_uMVMatrix");
    
	shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    shaderProgram.rotYMatrixUniform = gl.getUniformLocation(shaderProgram, "rotYMatrix");
	shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); 
	shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor"); 
	shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
	shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
    shaderProgram.vsSkyboxUniform = gl.getUniformLocation(shaderProgram, "vsSkybox");
    shaderProgram.fsSkyboxUniform = gl.getUniformLocation(shaderProgram, "fsSkybox");
    shaderProgram.reflectionMappingUniform = gl.getUniformLocation(shaderProgram, "reflectionMapping");
    shaderProgram.reflectionBlendingUniform = gl.getUniformLocation(shaderProgram, "reflectionBlending");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.cubeSamplerUniform = gl.getUniformLocation(shaderProgram, "uCubeSampler");
}

/**
 * Draw the skybox using the 6 separate buffer sets and textures
 * @param {float} scale Amount to scale the 1x1x1 skybox by
 */
function drawSkybox(scale) {
    if (typeof(scale)==='undefined') scale = 1.0;
    
    //Face order: Front, Back, Top, Bottom, Right, Left
    var textureRots = [180.0, -90.0, 0.0, -90.0, 90.0, 180.0];
    //Which axis to rotate the texture over; 0: X, 1: Y, 2: Z
    var textureRotAxes = [2, 2, 1, 1, 0, 0];
    mvPushMatrix();
    if(scale != 1.0) mat4.scale(mvMatrix, mvMatrix, vec3.fromValues(scale, scale, scale));
    gl.enableVertexAttribArray(shaderProgram.texCoordAttribute);
    gl.disableVertexAttribArray(shaderProgram.vertexNormalAttribute); //don't need normals
    uploadSkyboxToShader(true);
    
    for(var f = 0; f < 6; f++) { //draw each face and texture separately
        //1. Set appropriate new mvMatrix settings for this face and upload to shader
        mvPushMatrix();
        switch(textureRotAxes[f]) {
            case 0: mat4.rotateX(mvMatrix, mvMatrix, degToRad(textureRots[f]) );
                break;
            case 1: mat4.rotateY(mvMatrix, mvMatrix, degToRad(textureRots[f]) );
                break;
            case 2: mat4.rotateZ(mvMatrix, mvMatrix, degToRad(textureRots[f]) );
                break;
        }
        setMatrixUniforms();

        //2. Bind all the buffers, specify texture, and draw
        gl.bindBuffer(gl.ARRAY_BUFFER, skyboxVertexPosBufs[f]);
        gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, skyboxVertexPosBufs[f].itemSize, gl.FLOAT, false, 0, 0);
        
        // Set the texture coordinates attribute for the vertices.
        
        gl.bindBuffer(gl.ARRAY_BUFFER, skyboxTCoordBufs[f]);
        gl.vertexAttribPointer(shaderProgram.texCoordAttribute, skyboxTCoordBufs[f].itemSize, gl.FLOAT, false, 0, 0);
        
        // Specify the texture to map onto the faces.
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, skyboxTextures[f]);
        gl.uniform1i(shaderProgram.samplerUniform, 0);
        
        // Draw the cube.
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBufs[f]);
        gl.drawElements(gl.TRIANGLES, skyboxIndexBufs[f].numberOfItems, gl.UNSIGNED_SHORT, 0);
        
        mvPopMatrix(); //revert mvMatrix to the one with only scaling
    }
    mvPopMatrix(); //revert to mvMatrix before drawSkybox() was called
}

/**
 * Draw a polygonal object for shading with or without environment reflection mapping.
 * @param vertexBuf The vertex buffer for the polygonal object to draw
 * @param indexBuf The indxe buffer for the polygonal object to draw
 * @param normalBuf The vertex normal buffer for the polygonal object to draw
 * @param {float} scale Amount to scale the object by
 * @param {float} rotX Amount in degrees to rotate the object about the X axis.
 * @param {float} rotY Amount in degrees to rotate the object about the Y axis.
 * @param {float} rotZ Amount in degrees to rotate the object about the Z axis.
 * @param {bool} refMapping True indicates we should use reflection mapping on the mesh, if option enabled. False will never draw reflections.
 */
function drawMesh(vertexBuf, indexBuf, normalBuf, scale, rotX, rotY, rotZ, refMapping) {
    if (typeof(scale)==='undefined') scale = 1.0;
    if (typeof(rotX)==='undefined') rotX = 0.0;
    if (typeof(rotY)==='undefined') rotY = 0.0;
    if (typeof(rotZ)==='undefined') rotZ = 0.0;
    if (typeof(refMapping)==='undefined') refMapping = reflectionMapping;
    
    mvPushMatrix();
    if(scale != 1.0) mat4.scale(mvMatrix, mvMatrix, vec3.fromValues(scale, scale, scale));
    if(rotX != 0.0) mat4.rotateX(mvMatrix, mvMatrix, degToRad(rotX));
    if(rotY != 0.0) mat4.rotateY(mvMatrix, mvMatrix, degToRad(rotY));
    if(rotZ != 0.0) mat4.rotateZ(mvMatrix, mvMatrix, degToRad(rotZ));
    setMatrixUniforms();
    uploadSkyboxToShader(false);
    //T && T -> use reflection mapping. Either F -> no reflections.
    refMapping = refMapping && reflectionMapping;
    gl.uniform1i(shaderProgram.reflectionMappingUniform, refMapping);
    if(refMapping) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMapTexture);
        gl.uniform1i(shaderProgram.cubeSamplerUniform, 1);
        //Set up Y-rotation matrix for use in fragment shader (to rotate reflection vector)
        var rad = degToRad(rotDegreesY);
        rotYMatrix[0] = Math.cos(rad);
        rotYMatrix[1] = 0.0;
        rotYMatrix[2] = -1.0*Math.sin(rad);
        rotYMatrix[3] = 0.0;
        rotYMatrix[4] = 1.0;
        rotYMatrix[5] = 0.0;
        rotYMatrix[6] = Math.sin(rad);
        rotYMatrix[7] = 0.0;
        rotYMatrix[8] = Math.cos(rad);
        gl.uniformMatrix3fv(shaderProgram.rotYMatrixUniform, false, rotYMatrix);
    }
        
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, vertexBuf.itemSize, gl.FLOAT, false, 0, 0);
    
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute); //need normals
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuf);
    gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, normalBuf.itemSize, gl.FLOAT, false, 0, 0);
    
    gl.disableVertexAttribArray(shaderProgram.texCoordAttribute); //no textures
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.drawElements(gl.TRIANGLES, indexBuf.numberOfItems, gl.UNSIGNED_SHORT, 0);
    
    mvPopMatrix(); //revert to mvMatrix before drawMesh() was called
}

/**
 * Draw the skybox and teapot if all images have been loaded.
 */
function draw() {
    if(imagesLoaded) {
  
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective 
    mat4.perspective(pMatrix,degToRad(45), gl.viewportWidth / gl.viewportHeight, 0.1, 200.0);
 
    // We want to look down -z, so create a lookat point in that direction 
	vec3.add(viewPt, eyePt, viewDir);
	// Then generate the lookat matrix and initialize the MV matrix to that view
	mat4.lookAt(mvMatrix,eyePt,viewPt,up); 
       
    //uploadLightsToShader([0,1,1],[0.3,0.3,0.3],[0.75,0.75,0.75],[0.2,0.2,0.2]); //grey-black: [0.3, 0.3, 0.3]
    //uploadLightsToShader([0,1,1],[0.5,0.5,0.8],[0.75,0.75,0.75],[0.2,0.2,0.2]); //blue: [0.5, 0.5, 0.8]
    uploadLightsToShader([1,1,-1],[0.5,0.5,0.8],[0.75,0.75,0.75],[0.2,0.2,0.2]); //blue: [0.5, 0.5, 0.8]
    
    //Draw 
    mvPushMatrix(); //save current mvMatrix for later
    mat4.rotateX(mvMatrix,mvMatrix,modelXRotationRadians);
    mat4.rotateY(mvMatrix,mvMatrix,modelYRotationRadians);
    drawSkybox(40.0); //textures will be a bit low-res, but environment looks less boxy.
    drawMesh(teapotVertexPosBuf, teapotIndexBuf, teapotNormalBuf, scale / 100.0, teapotRotX, 0, teapotRotZ, true); //draw teapot
    //drawMesh(teapotVertexPosBuf, teapotIndexBuf, teapotNormalBuf, 0.27, teapotRotX, 0, teapotRotZ, true); //draw longsword
    //drawMesh(teapotVertexPosBuf, teapotIndexBuf, teapotNormalBuf, 0.4, teapotRotX, 0, teapotRotZ, true); //draw longsword
    mvPopMatrix(); //revert to original lookAt matrix
    }
}

/**
 * Load as many textures from image names that are specified.
 * @param {Array} texturesOut Resulting textures that we will have loaded. Initialize to be Array(0) before calling.
 * @param {Array} imagesOut Resulting images that we will have loaded. Initialize to be Array(0) before calling.
 * @param {Array} textureNames Array of strings of the file names to load in from the current server directory.
 */
function setupSkyboxTextures(texturesOut, imagesOut, textureNames) {
    var len = textureNames.length;
    var imagesToLoad = len; //#images left that haven't loaded yet
    var anotherWorking = false;
    for(var i = 0; i < len; i++) {
        console.log("Start texture setup process for i = " + i.toString());
        texturesOut[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texturesOut[i]);
        // Fill the texture with 1x1 blue pixel as debug in case file won't load
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
        imagesOut[i] = new Image();
        imagesOut[i].onload = function() {
            imagesToLoad--;
            if(imagesToLoad == 0) { //only one thread will be in here I think, since only one could have set it to 0
                if(anotherWorking) { console.log("Another thread was here first!"); throw new Error("Thread Race Condition in setupTextures! (How to fix?)"); }
                anotherWorking = true;
                for(var ii = 0 ; ii < len; ii++)
                    handleTextureLoaded(imagesOut[ii], texturesOut[ii]);
                imagesLoaded = true;
                console.log("All images finished loading");
            }
        }
        imagesOut[i].src = textureNames[i];
    }
}

/**
 * @param {number} value Value to determine whether it is a power of 2
 * @return {boolean} Boolean of whether value is a power of 2
 */
function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}

/**
 * Texture handling. Generates mipmap and sets texture parameters.
 * @param {Object} image Image for cube application
 * @param {Object} texture Texture for cube application
 */
function handleTextureLoaded(image, texture) {
  console.log("handleTextureLoaded, image = " + image);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
  // Check if the image is a power of 2 in both dimensions.
  if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
     // Yes, it's a power of 2. Generate mips.
     gl.generateMipmap(gl.TEXTURE_2D);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
     console.log("Loaded power of 2 texture");
  } else {
     // No, it's not a power of 2. Turn of mips and set wrapping to clamp to edge
     gl.texParameteri(gl.TETXURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TETXURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TETXURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
     console.log("Loaded non-power of 2 texture");
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

/**
 * Load from 2 OBJ files and set up buffers for the skybox (6 faces) and the teapot.
 */
function setupBuffers() {
    //1. Represent the skybox as 6 individual meshes of a cube
    var skyboxVertices = new Array(0);
    var skyboxIndices = new Array(0);
    var skyboxTCoords = new Array(0);
    parseOBJ("skyboxGeometry.obj", skyboxVertices, skyboxIndices, skyboxTCoords);

    //1.2 Partition the whole cube into 6 separate face meshes
    skyboxVertexPosBufs = new Array(6);
    skyboxIndexBufs = new Array(6);
    skyboxTCoordBufs = new Array(6);
    
    for(var f = 0; f < 6; f++) {
      //Each face has 4 vertices (16 elements), 6 face indices (6 elements), and 4 texture coordinates (8 elements)
         //arr.slice(a, b) returns arr[i] in range [a, b)
      skyboxVertexPosBufs[f] = setupVertexBuffer(skyboxVertices.slice(16*f, 16*(f+1)), 4);
      var curIndices = skyboxIndices.slice(6*f, 6*(f+1));
      skyboxTCoordBufs[f] = setupTextureCoordBuffer(skyboxTCoords.slice(8*f, 8*(f+1)) );
      //Now adjust the indices of curIndices to account for the slicing (want them in [0, 3])
      for(var v=0; v < 6; v++) {
          curIndices[v] -= 4*f;
      }
      skyboxIndexBufs[f] = setupIndexBuffer(curIndices);
    }
    
    //2. Load the teapot using objParse.js
    var teapotVertices = new Array(0);
    var teapotIndices = new Array(0);
    var LONGSWORDCOLORS = new Array(0);
    //hi
    parseOBJ("teapot_0.obj", teapotVertices, teapotIndices);
    //parseOBJ("longsword.obj", teapotVertices, teapotIndices);
    //2.2 Find the vertex normals (via averaged face normals)
    var teapotNormals = new Float32Array(teapotVertices.length / 4 * 3); //vertices are 4-vec; normals are 3-vec
    findVertexNormals(teapotVertices, teapotIndices, teapotNormals);
    //2.3 Create buffers
    teapotVertexPosBuf = setupVertexBuffer(teapotVertices, 4);
    teapotIndexBuf = setupIndexBuffer(teapotIndices);
    teapotNormalBuf = setupNormalBuffer(teapotNormals);
}

/**
 * Create a vertex position buffer for an array of vertex positions.
 * @param {Array} normals Array of contiguous (vectorSize)-vec vertex positions
 * @param {int} vectorSize Size of a single vertex position vector (default 4; 3 also typical xyz)
 * @return {GLBufferObject}
 */
function setupVertexBuffer(vertices, vectorSize) {
    if (typeof(vectorSize)==='undefined') vectorSize = 4;
    var vertexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW); //no movement
    vertexBuf.itemSize = vectorSize;
    vertexBuf.numberOfItems = vertices.length / vectorSize;
    return vertexBuf;
}

/**
 * Create a tri-index buffer for an array of mesh indices.
 * @param {Array} indices Array of contiguous mesh indices in triangle format
 * @return {GLBufferObject}
 */
function setupIndexBuffer(indices) {
    var indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    indexBuf.size = 1;
    indexBuf.numberOfItems = indices.length;
    return indexBuf;
}

/**
 * Create a texture coordinates buffer for an array of texture coordinates.
 * @param {Array} textureCoords Array of contiguous 2-vec texture coordinates (u, v)
 * @return {GLBufferObject}
 */
function setupTextureCoordBuffer(textureCoords) {
    var textureBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuf);
    gl.bufferData(gl.ARRAY_BUFFER,  new Float32Array(textureCoords), gl.STATIC_DRAW);
    textureBuf.itemSize = 2;
    textureBuf.numberOfItems = textureCoords.length / 2;
    return textureBuf;
}

/**
 * Create a vertex normals buffer for an array of vertex normals.
 * @param {Array} normals Array of contiguous 3-vec vertex normals
 * @return {GLBufferObject}
 */
function setupNormalBuffer(normals) {
    var normalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    normalBuf.itemSize = 3;
    normalBuf.numberOfItems = normals.length / 3;
    return normalBuf;
}


var pressedKeys = {};

function handleKeyDown(event) {
    pressedKeys[event.keyCode] = true;
}

function handleKeyUp(event) {
    pressedKeys[event.keyCode] = false;
}

/**
 * Handle any keys of interest that were pressed in this frame (camera movement)
 */
function handleKeys() {
    //   http://keycode.info/
    if(pressedKeys[37] || pressedKeys[65]) { //Left arrow OR A: Turn left (orbit teapot left) (about y axis)
        quat.setAxisAngle(quatLR, vec3.fromValues(0.0,1.0,0.0), degToRad(-1.0 * rotDegrees));
        vec3.transformQuat(eyePt,eyePt,quatLR);
        //viewDir = normalize(vec3.fromValues(0.0 - eyePt[0], viewDir[1], 0.0 - eyePt[2])); //ensure always looking at teapot
        
        var oldY = viewDir[1];
        viewDir = normalize(vec3.fromValues(0.0 - eyePt[0], 0.0, 0.0 - eyePt[2])); //ensure always looking at teapot
        viewDir[1] = oldY;
        
        
        rotDegreesY -= rotDegrees;
        if(rotDegreesY <= -360.0) rotDegreesY += 360.0;
    }
    if(pressedKeys[39] || pressedKeys[68]) { //Right arrow OR D: Turn right (orbit teapot right) (about y axis)
        quat.setAxisAngle(quatLR, vec3.fromValues(0.0,1.0,0.0), degToRad(rotDegrees));
        vec3.transformQuat(eyePt,eyePt,quatLR);
        //viewDir = normalize(vec3.fromValues(0.0 - eyePt[0], viewDir[1], 0.0 - eyePt[2])); //ensure always looking at teapot
        
        var oldY = viewDir[1];
        viewDir = normalize(vec3.fromValues(0.0 - eyePt[0], 0.0, 0.0 - eyePt[2])); //ensure always looking at teapot
        viewDir[1] = oldY;
        
        rotDegreesY += rotDegrees;
        if(rotDegreesY >= 360.0) rotDegreesY -= 360.0;
    }
    if(pressedKeys[87]) { //W: pitch up
        var axis = cross(viewDir, up); //rot. about the axis perpendicular to both viewDir and up
        quat.setAxisAngle(eyeQuatUD, axis, degToRad(rotDegrees)) //create the quat
        vec3.transformQuat(viewDir,viewDir,eyeQuatUD); //apply to viewDir
        vec3.transformQuat(up,up,eyeQuatUD); //apply to up (so viewDir and up are always perpendicular)
    }
    if(pressedKeys[83]) { //S: pitch down
        var axis = cross(viewDir, up);
        quat.setAxisAngle(eyeQuatUD, axis, degToRad(-1.0 * rotDegrees)) //create the quat
        vec3.transformQuat(viewDir,viewDir,eyeQuatUD); //apply to viewDir
        vec3.transformQuat(up,up,eyeQuatUD); //apply to up (so viewDir and up are always perpendicular)
    }
    if(pressedKeys[38]) { //Up Arrow: move forward
        //Move in direction of viewDir
        var velocity = vec3.fromValues(speed*viewDir[0], speed*viewDir[1], speed*viewDir[2]);
        vec3.add(eyePt, velocity, eyePt);
    }
    if(pressedKeys[40]) { //Back Arrow: move backward
        //Move in opposite direction of viewDir
        var velocity = vec3.fromValues(-1.0*speed*viewDir[0], -1.0*speed*viewDir[1], -1.0*speed*viewDir[2]);
        vec3.add(eyePt, velocity, eyePt);
    }
}

function handleMouseDown() {
    mouseDown = true;
}

function handleMouseUp() {
    mouseDown = false;
}

/**
 * Use combined mouse click & movement to rotate the teapot. Change in X -> roll teapot; Change in Y -> rotate up/down.
 * Uses Euler angles b/c I could not get quaternions to apply correctly for some reason :(
 */
function handleMouseMove(event) {
    if(mouseDown && lastMousePos[0] != -1.0 && lastMousePos[1] != -1.0) {
        change = [lastMousePos[0] - event.clientX, event.clientY - lastMousePos[1]];
        //Roll left/right if change in mouse X
        if(change[0] != 0) {
            var sign = 1.0;
            if(change[0] < 0) sign = -1.0;
            
            teapotRotZ += sign * rotDegrees;
            if(teapotRotZ >= 360.0) teapotRotZ -= 360.0;
            if(teapotRotZ <= -360.0) tepotRotZ += 360.0;
        }
        //Rotate up/down if change in mouse Y
        if(change[1] != 0) {
            var sign = 1.0;
            if(change[1] < 0) sign = -1.0;
            
            teapotRotX += sign * rotDegrees;
            if(teapotRotX >= 360.0) teapotRotX -= 360.0;
            if(teapotRotX <= -360.0) tepotRotX += 360.0;
        }
    }
    lastMousePos[0] = event.clientX;
    lastMousePos[1] = event.clientY;
}

/**
 * Change some rendering parameters depending on what options user has selected in the HTML.
 * 1: Environment Reflection Mapping: Checked indicates to use environment reflection mapping on meshes when desired; Unchecked never uses it.
 * 2: Environment Reflection Blending: Checked indicates that if using reflection mapping, we should blend with the underlying mesh shading.
 * 3: Spinny World: For fun, enable use of the HelloTexture spinning cube animation.
 */
function handleOptions() {
    reflectionMapping = document.getElementById("reflect").checked;
    reflectionBlending = document.getElementById("reflectBlend").checked;
    spinnyWorld = document.getElementById("spinnyWorld").checked;
    scale = document.getElementById("scale").value;
    gl.uniform1i(shaderProgram.reflectionBlendingUniform, reflectionBlending);
    if(!spinnyWorld) { //reset world rotation to 0 when unchecked
        modelXRotationRadians = 0.0;
        modelYRotationRadians = 0.0;
    }
}

/**
 * Startup function called from html code to start program.
 */
 function startup() {
  canvas = document.getElementById("myGLCanvas");
     lastMousePos = new Array(2);
     lastMousePos[0] = -1.0; //indicating no movement yet
     lastMousePos[1] = -1.0; //...
     document.onkeydown = handleKeyDown;
     document.onkeyup = handleKeyUp;
     document.onmousedown = handleMouseDown;
     document.onmouseup = handleMouseUp;
     document.onmousemove = handleMouseMove;
  gl = createGLContext(canvas);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
    
  setupShaders();
  setupBuffers();
  skyboxTextures = new Array(6);
  skyboxImages = new Array(6);
  setupSkyboxTextures(skyboxTextures, skyboxImages, ["pos-x.png", "neg-x.png", "pos-y.png", "neg-y.png", "pos-z.png", "neg-z.png"]);
  setupCubeMap();
  tick();
}

/**
 * Tick called for every animation frame.
 */
function tick() {
    requestAnimFrame(tick);
    draw();
    handleKeys();
    handleOptions();
    if(spinnyWorld) animate();
}

/**
 * From HelloTexture Demo. Animation to be called from tick. Updates global rotation values.
 */
function animate() {
    if (then==0)
    {
        then = Date.now();
    }
    else
    {
        now=Date.now();
        // Convert to seconds
        now *= 0.001;
        // Subtract the previous time from the current time
        var deltaTime = now - then;
        // Remember the current time for the next frame.
        then = now;

        //Animate the rotation
        modelXRotationRadians += 1.2 * deltaTime;
        modelYRotationRadians += 0.7 * deltaTime;  
    }
}

/**
 * Taken from Discussion5Demo. We'll use the cube map only for environment reflection mapping.
 */
function setupCubeMap() {
	cubeMapTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMapTexture);
	//gl.texImage2D(gl.TEXTURE_CUBE_MAP, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_X, cubeMapTexture, "pos-x.png");  
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_X, cubeMapTexture, "neg-x.png"); 
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_Y, cubeMapTexture, "pos-y.png");  
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, cubeMapTexture, "neg-y.png");  
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_Z, cubeMapTexture, "pos-z.png");  
	loadCubeMapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, cubeMapTexture, "neg-z.png");
}

function loadCubeMapFace(gl, target, texture, url){
	var image = new Image();
	image.onload = function()
	{
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
		gl.texImage2D(target,0,gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	}
	image.src = url;
}