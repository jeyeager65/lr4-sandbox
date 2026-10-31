// three.js as ES modules (Part 49: vendored in vendor/three/, the import map in index.html) handed to the
// page's classic scripts as one global, as the old examples/js builds did: window.THREE = the core + the add-ons the
// page uses. The classic scripts are deferred after this module, so they run once it has (document order).
import * as CORE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

window.THREE = Object.assign({}, CORE, { OrbitControls, TrackballControls, RoomEnvironment, RectAreaLightUniformsLib });
// color management off (on by default since r152): the page's hex / CSS colors are used as they are, as in r147
CORE.ColorManagement.enabled = false;
