# Occupancy Grid Testing Scripts

These modified test scripts allow you to test the occupancy grid building logic by streaming live LIDAR data and visualizing the resulting occupancy grid map in real-time.

## Overview

- **RPLidar_socket_test.py**: Connects to the RPLidar, builds an occupancy grid from scans, and streams the grid to a server
- **lidar_map_server_helper.py**: Receives the occupancy grid and displays it in a live 2D visualization

## Dependencies

Make sure you have the following Python packages installed:

```bash
pip install pyserial numpy matplotlib
```

## Usage

### Step 1: Start the Map Server (on your PC)

```bash
python lidar_map_server_helper.py 0.0.0.0 5555 --visualize --viz-update-hz 5.0
```

Parameters:
- `0.0.0.0`: Listen on all network interfaces
- `5555`: Port number
- `--visualize`: Enable real-time GUI display
- `--viz-update-hz`: Visualization update frequency (Hz)

### Step 2: Start the LIDAR Client (on the robot)

```bash
python RPLidar_socket_test.py /dev/ttyUSB0 <PC_IP> 5555 --visualize
```

Parameters:
- `/dev/ttyUSB0`: Serial port for RPLidar
- `<PC_IP>`: IP address of your PC running the server
- `5555`: Port number (must match server)
- `--grid-resolution`: Grid cell size in meters (default: 0.05)
- `--grid-width`: Grid width in cells (default: 400)
- `--grid-height`: Grid height in cells (default: 400)
- `--scan-limit`: Optional limit on number of scans to process
- `--log-every`: Log every N grids (default: 10)

### Example: Testing with Custom Grid Size

For a larger area (30m x 30m at 10cm resolution):

```bash
python RPLidar_socket_test.py /dev/ttyUSB0 192.168.1.100 5555 \
    --grid-resolution 0.1 \
    --grid-width 300 \
    --grid-height 300 \
    --log-every 5
```

## What to Look For

The visualization should show:
- **White areas**: Free space (no obstacles)
- **Black areas**: Occupied space (obstacles detected)
- **Gray areas**: Unknown space (not yet scanned)
- **Colorbar**: Occupancy values (0-255)
- **Stats**: Grid count, size, resolution, completion percentage

## Testing Strategy

1. **Static Test**: Keep the robot stationary and observe how the occupancy grid builds up around it
   - You should see a clear representation of obstacles in the environment
   - Free space should be marked white
   - The grid should update smoothly

2. **Rotation Test**: Slowly rotate the robot 360 degrees
   - The grid should fill in a circular pattern
   - All obstacles around the robot should be visible
   - Check for any distortions or artifacts

3. **Movement Test**: Move the robot forward/backward
   - The grid should update correctly as the robot moves
   - Previously seen obstacles should remain marked
   - New areas should be filled in

## Troubleshooting

### No data being received
- Check that the LIDAR is connected and powered
- Verify the serial port (`ls /dev/ttyUSB*`)
- Check network connectivity between robot and PC
- Ensure firewall allows connections on port 5555

### Grid looks distorted
- This may indicate a problem with the occupancy grid building logic
- Check the coordinate transformations in `update_occupancy_grid()`
- Verify that the grid resolution and origin are set correctly
- Compare with the logic in `main.py` and `slam_manager.py`

### Performance issues
- Reduce the grid size (e.g., 200x200 cells)
- Increase grid resolution (e.g., 0.1m instead of 0.05m)
- Reduce visualization update rate (e.g., 2-3 Hz)

## Comparison with main.py

The test script uses a simplified version of the SLAM manager's map update logic. Key differences:

1. **No particle filter**: Robot is assumed to be stationary at origin (0, 0, 0)
2. **Simplified ray tracing**: Uses the same algorithm as `slam_manager.py`
3. **No sensor fusion**: Only uses raw LIDAR data

If you see differences between the test visualization and the actual robot behavior, this may indicate an issue with:
- The particle filter pose estimation
- Sensor fusion integration
- The coordinate transformations in `slam_manager.py`

## Modified Files

- `RPLidar_socket_test.py`: Now uses `sensors.lidar.RPLidarSerial` and `slam.occupancy_grid.OccupancyGrid`
- `lidar_map_server_helper.py`: Now receives and visualizes occupancy grid data instead of raw scan points

