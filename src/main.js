import * as THREE from 'three';
import Stats from 'stats.js';
import { MapControls } from './OrbitControls';
import { vertexShader, fragmentShader } from './shaders';
import ROSLIB from 'roslib/src/RosLib';
import { processMessage } from './PointCloud2';
import GUI from 'lil-gui';

const URL = `ws://${window.location.hostname}:9090`
const info = document.getElementById('info');
const drone_id = 1;

info.innerText = `Connecting to ${URL}`;
const ros = new ROSLIB.Ros({ url: URL });

const DISCONNECTED = 0;
const CONNECTED = 1;
let ROS_STATUS = DISCONNECTED;

const gui = new GUI();
const status = {
    up: false,
    batteryPercentage: 0,
    batteryVoltage: 0,
    toggle() {
        if (!status.up) {
            toggleButton.disable();
            fetch('/setup');
        } else if (confirm('Are you sure to shutdown ego-planer?')) {
            toggleButton.disable();
            fetch('/shutdown');
        }
    }
};

const toggleButton = gui.add(status, 'toggle');
toggleButton.name('Start ego-planer');
toggleButton.disable();
gui.add(status, 'batteryPercentage', 0, 100).listen();
gui.add(status, 'batteryVoltage', 3.5, 4.2).listen();

async function updateStatus() {
    const response = await fetch('/status');
    const data = await response.json();
    status.up = data.up;
    if (data.up) {
        toggleButton.name('Shutdown ego-planer')
        toggleButton.object
    } else {
        toggleButton.name('Start ego-planner')
    }
    if (data.busy) {
        toggleButton.disable();
    } else {
        toggleButton.enable();
    }
}

let latency = 0;
async function ping() {
    const tic = new Date().getTime();
    await updateStatus();
    latency = new Date().getTime() - tic;
    if (ROS_STATUS == CONNECTED) {
        info.innerText = `${latency}ms`;
    }
}
setInterval(ping, 2000);

ros.on('connection', function () {
    ROS_STATUS = CONNECTED;
    console.log('Connected to websocket server.');
    registerRviz();
    info.innerText = `Connected`;
});

ros.on('error', function (error) {
    ROS_STATUS = DISCONNECTED;
    console.log('Error connecting to websocket server: ', error);
    ros.connect(URL)
    info.innerText = `Connection error. Reconnecting to ${URL}`;
});

ros.on('close', function () {
    ROS_STATUS = DISCONNECTED;
    console.log('Connection to websocket server closed.');
    ros.connect(URL)
    info.innerText = `Connection closed. Reconnecting to ${URL}`;
});

const rviz = new THREE.Object3D();

function registerRviz() {

    const batteryListener = new ROSLIB.Topic({
        ros: ros,
        name: '/mavros/battery',
        messageType: 'sensor_msgs/BatteryState',
        throttle_rate: 2000,
        queue_size: 1,
    });
    batteryListener.subscribe(function (message) {
        status.batteryPercentage = Math.round(message.percentage * 1000) / 10;
        status.batteryVoltage = Math.round(message.voltage / 4 * 1000) / 1000;
    })

    rviz.clear();
    const occupancy = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial({ vertexColors: true, size: 0.1 }));
    // occupancy.castShadow = true;
    // occupancy.receiveShadow = true;
    const occupancyListener = new ROSLIB.Topic({
        ros: ros,
        name: '/drone_'+drone_id+'_ego_planner_node/grid_map/occupancy',
        messageType: 'sensor_msgs/PointCloud2',
        compression: 'cbor',
        throttle_rate: 500,
        queue_size: 1,
    });
    occupancyListener.subscribe(function (message) {
        const { points, colors } = processMessage(message);
        occupancy.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        occupancy.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        // const geometries = points.map(p => (new THREE.BoxGeometry(.1, .1, .1)).translate(p.y, p.z, p.x))
        // occupancy.geometry = mergeBufferGeometriesOptimized(geometries);
    });
    occupancy.frustumCulled = false;
    rviz.add(occupancy);

    const odomGeometry = new THREE.CylinderGeometry(0, .1, .2, 5, 1);
    odomGeometry.rotateY(Math.PI)
    odomGeometry.rotateX(Math.PI / 2)
    const odom = new THREE.Mesh(odomGeometry,
        new THREE.MeshLambertMaterial({ color: 0x999999 }));
    const odomTrajGeometry = new THREE.BufferGeometry();
    const odomTrajMaterial = new THREE.LineBasicMaterial({
        linewidth: 3,
        color: 0x00ff00
    });
    const odomPoints = [];
    const odomTraj = new THREE.Line(odomTrajGeometry, odomTrajMaterial);
    const odomListener = new ROSLIB.Topic({
        ros: ros,
        name: '/vins_fusion/odometry',
        messageType: 'nav_msgs/Odometry',
        throttle_rate: 250,
        queue_size: 1,
    });
    odomListener.subscribe(function (message) {
        const { x, y, z } = message.pose.pose.position;
        odom.position.set(y, z, x);
        const l = odomPoints.length;
        if (l == 0 || (x - odomPoints[l - 1]) ** 2 + (y - odomPoints[l - 3]) ** 2 + (z - odomPoints[l - 2]) ** 2 > 0.01) {
            odomPoints.push(y, z, x);
            odomTraj.geometry.setAttribute('position', new THREE.Float32BufferAttribute(odomPoints, 3));
        }
        {
            const { x, y, z, w } = message.pose.pose.orientation;
            odom.setRotationFromQuaternion(new THREE.Quaternion(y, z, x, w));
        }
    });
    odom.frustumCulled = false;
    rviz.add(odom);
    odomTraj.frustumCulled = false;
    rviz.add(odomTraj);

    const posTarget = new THREE.LineSegments(
        new THREE.OctahedronGeometry(0.1),
        new THREE.LineBasicMaterial({ color: 0xff0000 }));
    const posTargetListener = new ROSLIB.Topic({
        ros: ros,
        name: '/position_cmd',
        messageType: 'quadrotor_msgs/PositionCommand',
        throttle_rate: 250,
        queue_size: 1,
    });
    posTargetListener.subscribe(function (message) {
        const { x, y, z } = message.position;
        posTarget.position.set(y, z, x);
    })
    posTarget.frustumCulled = false;
    rviz.add(posTarget);

    const optimalTrajListener = new ROSLIB.Topic({
        ros: ros,
        name: '/drone_'+drone_id+'_ego_planner_node/optimal_list',
        messageType: 'visualization_msgs/Marker',
        throttle_rate: 250,
        queue_size: 1,
    });
    const optimalTraj = new THREE.Object3D();
    optimalTrajListener.subscribe(function (message) {
        optimalTraj.clear()
        const { r, g, b } = message.color;
        const points = [];
        message.points.forEach(p => {
            const { x, y, z } = p;
            points.push(y, z, x);
        })
        const optimalTrajGeometry = new THREE.BufferGeometry();
        const optimalTrajMaterial = new THREE.LineBasicMaterial({
            linewidth: 5,
            color: new THREE.Color(r, g, b)
        });
        optimalTrajGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const line = new THREE.Line(optimalTrajGeometry, optimalTrajMaterial);
        optimalTraj.add(line);
    });
    optimalTraj.frustumCulled = false;
    rviz.add(optimalTraj);

    const goalPublisher = new ROSLIB.Topic({
        ros: ros,
        name: '/move_base_simple/goal',
        messageType: 'geometry_msgs/PoseStamped',
    });

    const raycaster = new THREE.Raycaster();

    function makeMsg(point) {
        const msg = new ROSLIB.Message({
            header: {
                frame_id: "world"
            },
            pose: {
                position: { x: point.z, y: point.x, z: 0 },
                orientation: { x: 0, y: 0, z: 0, w: 1 }
            }
        })
        goalPublisher.publish(msg)
    }

    document.addEventListener('dblclick', function (event) {
        const pointer = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            - (event.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(ground, camera)
        if (intersects.length) {
            makeMsg(intersects[0].point)
        }
    })
}


const stats = new Stats()
stats.showPanel(0) // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom)

const scene = new THREE.Scene();
// scene.background = new THREE.Color( 0xf0f0f0 );



scene.add(new THREE.AmbientLight(0x505050));

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000);
camera.position.set(0, 6, 0);

// LIGHTS

const light = new THREE.DirectionalLight(0xaabbff, 1.5);
// light.position.x = 0.5;
// light.position.y = 5;
// light.position.z = 0.5;

// light.castShadow = true;
// light.shadow.camera.near = .1;
// light.shadow.camera.far = 10000;
// light.shadow.mapSize.width = 1024;
// light.shadow.mapSize.height = 1024;

scene.add(light);

// SKYDOME

const uniforms = {
    topColor: { value: new THREE.Color(0x0077ff) },
    bottomColor: { value: new THREE.Color(0xffffff) },
    offset: { value: 400 },
    exponent: { value: 0.6 }
};
uniforms.topColor.value.copy(new THREE.Color(0xaabbff));

const skyGeo = new THREE.SphereGeometry(4000, 32, 15);
const skyMat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide
});

const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

const groundGeo = new THREE.PlaneGeometry(10000, 10000);
const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = - Math.PI / 2;
// ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.GridHelper(50, 50))

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', onWindowResize);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

const controls = new MapControls(camera, renderer.domElement);

controls.screenSpacePanning = false;

controls.minDistance = 3;
controls.maxDistance = 30;

controls.maxPolarAngle = Math.PI / 2 - .1;

controls.rotateLeft(Math.PI);
controls.target.z = 2;
controls.update();

scene.add(rviz);

function animate() {
    requestAnimationFrame(animate);

    renderer.render(scene, camera);
    stats.update()
};

animate();
