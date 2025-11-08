# Triangle Test Live Viewer

A real-time visualization tool for the RoboMop triangle calibration test.

## Overview

This tool provides live visualization of the robot's position, trajectory, and occupancy grid map during the triangle calibration test. It uses WebSocket communication to stream data from the robot to a viewer application running on any machine on the same network.

## Features

- **Real-time map visualization**: See the occupancy grid as it's being built
- **Trajectory tracking**: View the actual path taken by the robot (red line)
- **Planned path overlay**: Compare actual vs planned trajectory (blue dashed line)
- **Current pose indicator**: Green dot shows robot's current position
- **Auto-scaling view**: Automatically adjusts to keep all data visible

## Installation

### On the Viewer Machine

Install the required Python dependencies:

```powershell
python -m pip install websockets matplotlib numpy
```

### On the Robot

The robot already has the necessary dependencies installed. No additional setup required.

## Usage

### Step 1: Start the Viewer Server

On your viewing machine (laptop, desktop, etc.), run:

```powershell
python robot\tests\manual_tests\triangle_viewer.py --host 0.0.0.0 --port 8765
```

This will:
- Start a WebSocket server listening on port 8765
- Open a Matplotlib window ready to display updates
- Wait for the robot to connect

**Options:**
- `--host`: IP address to bind to (default: 0.0.0.0 for all interfaces)
- `--port`: Port number (default: 8765)
- `--log-level`: Logging verbosity (DEBUG, INFO, WARNING, ERROR)

### Step 2: Run the Triangle Test on the Robot

On the robot, run the triangle test with streaming enabled:

```powershell
python -m robot.src.main --triangle-test --triangle-stream-url ws://<viewer-ip>:8765
```

Replace `<viewer-ip>` with the IP address of your viewing machine.

**For localhost testing** (viewer and robot on same machine):
```powershell
python -m robot.src.main --triangle-test --triangle-stream-url ws://localhost:8765
```

### Step 3: Watch the Visualization

The viewer will display:
- **Gray background**: Occupancy grid (white=free space, gray=unknown, black=obstacles)
- **Blue dashed line**: Planned equilateral triangle path (1m sides)
- **Red solid line**: Actual trajectory taken by the robot
- **Green triangle**: Starting position
- **Green circle**: Current robot position

Updates are sent every 100ms (10 Hz) during the test.

## Example Session

```powershell
# Terminal 1 (Viewer Machine)
PS C:\Users\sebas\Desktop\RoboMop> python robot\tests\manual_tests\triangle_viewer.py
2025-11-08 10:30:00 [INFO] triangle_viewer: Triangle viewer initialized
2025-11-08 10:30:00 [INFO] triangle_viewer: Starting WebSocket server on ws://0.0.0.0:8765
2025-11-08 10:30:00 [INFO] triangle_viewer: Waiting for robot connection...
2025-11-08 10:30:15 [INFO] triangle_viewer: Client connected from ('192.168.1.100', 54321)
2025-11-08 10:30:15 [INFO] triangle_viewer: Received update #10
2025-11-08 10:30:16 [INFO] triangle_viewer: Received update #20
...

# Terminal 2 (Robot)
PS C:\Users\sebas\Desktop\RoboMop> python -m robot.src.main --triangle-test --triangle-stream-url ws://192.168.1.50:8765
2025-11-08 10:30:15 [INFO] robomop: Starting triangle calibration test (1m equilateral triangle)
2025-11-08 10:30:15 [INFO] robomop: Connected to triangle viewer at ws://192.168.1.50:8765
2025-11-08 10:30:15 [INFO] robomop: Triangle path loaded with 4 waypoints
...
```

## Troubleshooting

### Connection Failed

If the robot can't connect to the viewer:

1. **Check firewall**: Ensure port 8765 is open on the viewer machine
2. **Verify IP address**: Make sure you're using the correct IP of the viewer machine
3. **Network connectivity**: Ping the viewer machine from the robot to verify network access
4. **Viewer running**: Ensure the viewer was started before running the robot test

The robot will continue the test even if the viewer connection fails - it just won't stream updates.

### No Map Displayed

If you see trajectory but no map:
- The map is only sent when LIDAR data is available
- Check that the LIDAR is connected and functioning
- Map updates are sent at 10 Hz along with trajectory samples

### Viewer Window Not Responding

If the Matplotlib window freezes:
- This is normal during heavy updates
- The window should become responsive again after the test completes
- Try reducing the update rate if needed (modify `sample_interval` in main.py)

## Technical Details

### Protocol

The robot sends JSON messages over WebSocket with the following structure:

```json
{
  "type": "triangle_update",
  "timestamp": 1731000000.123,
  "pose": {
    "x": 0.12,
    "y": 0.34,
    "theta": 1.57
  },
  "trajectory": [[0.0, 0.0], [0.05, 0.0], ...],
  "plannedVertices": [[0, 0], [1, 0], [0.5, 0.866], [0, 0]],
  "map": {
    "resolution": 0.05,
    "width": 400,
    "height": 400,
    "origin": {"x": -10.0, "y": -10.0, "theta": 0.0},
    "data": "<base64 encoded uint8 array>",
    "encoding": "base64"
  }
}
```

### Performance

- **Update rate**: 10 Hz (every 100ms)
- **Network bandwidth**: ~50-200 KB/s depending on map size
- **Latency**: Typically <100ms on local network

### Security Note

This viewer is intended for **on-LAN testing only**. It does not implement authentication or encryption. Do not expose the viewer to untrusted networks.

## Files

- `triangle_viewer.py`: Main viewer server application
- `robot/src/main.py`: Robot application with streaming support (modified)

## See Also

- Main triangle test documentation in the robot source code
- RoboMop development guidelines for calibration procedures

