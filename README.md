# Web Control for ZJU Fast-Drone-250

A [three.js](https://threejs.org/) and [roslibjs](https://github.com/RobotWebTools/roslibjs) powered web-control for zju [fast-drone-250](https://github.com/ZJU-FAST-Lab/Fast-Drone-250) for laptop-free flight control (tested on Xiaomi 12x with WiFi hotspot).

![demo](https://github.com/zyayoung/oss/raw/main/demo.gif)

Features:
- [x] Visulizing occupancy, odometry, position_cmd, and planned trajectory
- [x] Set navigation goal by double clicking
- [x] Start / stop ego-planner
- [x] View battery volatage per cell (asserting 4 cells)
- [x] Flight recording

## How to use

### Prerequisite

Follow [fast-drone-250](https://github.com/ZJU-FAST-Lab/Fast-Drone-250) tutorial to setup ego-planer.

Install dependency.
```bash
sudo apt install nodejs npm
npm install
pip install flask
```

### Build

```bash
npm build
```

### Run

```bash
python app.py
```

You may `source /home/ros/Fast-Drone-250/devel/setup.bash` and modify the `setup` function in `app.py`.
