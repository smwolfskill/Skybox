# Skybox - 3D Model Viewer
Skybox is a simple web app which allows the user to dynamically view a 3D model (.obj format) with or without HD environment reflections while in a small city skybox.

The simplest way to launch the app is to create a local server using [python 3](https://www.python.org/downloads/) in a command-line interface.
Once you're in the source code directory, run the python server on port 8000:

`python3 -m http.server 8000`

Or if you have python 2,

`python -m SimpleHTTPServer 8000`

Then open the app in your browser:

`localhost:8000/Skybox.html`

To quit the server (unix) simply hit `CTRL^C` in command-line.

# Loading a Mesh
The app includes a teapot and longsword blade mesh.
To view your own mesh, place its .obj file directly within the source directory.
