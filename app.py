from threading import Lock, Thread
import os
import signal
import time
from flask import Flask, send_file, jsonify
from subprocess import Popen, run
app = Flask(__name__)

ps = []
is_up = False
p_lock = Lock()  # for future threading feature


def popen(cmd: str, cwd=None):
    ps.append(Popen(cmd.split(), cwd=cwd))


@app.route('/setup')
def setup():
    global is_up
    with p_lock:
        if is_up:
            return ""
        run("sudo chmod 777 /dev/ttyACM0".split())
        popen("roslaunch mavros px4.launch")
        time.sleep(2)
        popen("roslaunch realsense2_camera rs_camera.launch")
        time.sleep(4)
        popen("roslaunch vins fast_drone_250.launch")
        popen("roslaunch ego_planner single_run_in_exp.launch")
        popen("roslaunch rosbridge_server rosbridge_websocket.launch")
        popen("roslaunch px4ctrl run_ctrl.launch")
        os.makedirs("flight_records", exist_ok=True)
        popen("rosbag record -j --tcpnodelay "
            "/drone_0_ego_planner_node/grid_map/occupancy "
            "/vins_fusion/odometry "
            "/position_cmd "
            "/ego_planner_node/a_star_list "
            "/drone_0_ego_planner_node/init_list "
            "/drone_0_odom_visualization/path "
            "/drone_0_ego_planner_node/optimal_list "
            "/mavros/battery",
            cwd='flight_records')
        is_up = True
    return "OK"


@app.route('/shutdown')
def shutdown():
    global is_up
    with p_lock:
        for p in ps:
            p.send_signal(signal.SIGINT)
        for p in ps:
            p.wait()
        is_up = False
    return "OK"


@app.route('/')
def hello_world():
    return send_file('index.html')


@app.route('/bundle.js')
def bundle():
    return send_file('./bundle.js')


@app.route('/status')
def status():
    return jsonify({
        'busy': p_lock.locked(),
        'up': is_up,
    })


def on_sigterm(sig, stack):
    shutdown()
    exit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, on_sigterm)
    signal.signal(signal.SIGINT, on_sigterm)
    signal.signal(signal.SIGUSR1, on_sigterm)
    app.run('0', port=9966)
