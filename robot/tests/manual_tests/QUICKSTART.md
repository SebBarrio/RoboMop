# Quick Start Guide: Occupancy Grid Testing

## 🎯 Goal
Test if there's a problem with how the occupancy grid is built by streaming live LIDAR data and visualizing the resulting map.

## 📋 Prerequisites

1. **On your PC (running the server)**:
   ```bash
   pip install numpy matplotlib
   ```

2. **On your robot (running the client)**:
   ```bash
   pip install numpy pyserial
   ```

## 🚀 Quick Start (3 Steps)

### Step 1: Verify Setup

On the robot, verify all imports work:

```bash
cd robot/tests/manual_tests
python verify_imports.py
```

You should see all checkmarks (✓). If any imports fail, install the missing packages.

### Step 2: Start the Server (PC)

On your PC, run:

```bash
cd robot/tests/manual_tests
python lidar_map_server_helper.py 0.0.0.0 5555 --visualize
```

You should see:
```
INFO: Listening on 0.0.0.0:5555
```

### Step 3: Start the Client (Robot)

On your robot, run:

```bash
cd robot/tests/manual_tests
python RPLidar_socket_test.py /dev/ttyUSB0 <YOUR_PC_IP> 5555
```

Replace `<YOUR_PC_IP>` with your PC's IP address (e.g., `192.168.1.100`).

### What You Should See

**On the PC**:
- A dark-themed window showing the occupancy grid
- White areas = free space
- Black areas = obstacles
- Gray areas = unknown/unexplored
- Real-time updates as the robot scans

**In the terminal**:
```
INFO: Sent 10 grids (250 measurements, 2.3% complete)
INFO: Sent 20 grids (248 measurements, 4.1% complete)
...
```

## 🧪 Testing Scenarios

### Test 1: Static Robot
**Goal**: Verify basic grid building

1. Keep the robot completely still
2. Let it scan for 30-60 seconds
3. **Expected**: You should see a circular pattern of obstacles around the robot

### Test 2: Manual Rotation
**Goal**: Verify full 360° coverage

1. Slowly rotate the robot by hand (one full rotation over ~30 seconds)
2. **Expected**: The circle should complete, showing all obstacles around the robot

### Test 3: Movement
**Goal**: Verify grid updates as robot moves

1. Move the robot forward 1 meter
2. **Expected**: Grid should show new areas ahead (note: without SLAM, the map won't be perfectly aligned)

## 🐛 Troubleshooting

### "Import sensors.lidar could not be resolved"
✅ **Solution**: This is just a linter warning, ignore it. The import will work at runtime.

### "No such file or directory: '/dev/ttyUSB0'"
✅ **Solution**: Find the correct port:
```bash
ls /dev/ttyUSB*    # Linux
ls /dev/tty.usb*   # Mac
mode               # Windows (look for COM ports)
```

### "Connection refused"
✅ **Solution**:
- Make sure the server is running first
- Check that the PC's firewall allows port 5555
- Verify the IP address is correct: `ping <YOUR_PC_IP>`

### Grid looks wrong/distorted
🎯 **This is what we're testing for!** This indicates a problem with the grid building logic.

Common issues to check:
- Coordinate system (X/Y axis orientation)
- Angle conversion (radians vs degrees)
- Grid origin/offset
- Ray tracing algorithm

### "LIDAR read_scan() timed out"
✅ **Solution**:
- Check LIDAR is powered and spinning
- Check USB connection is secure
- Try unplugging and replugging the LIDAR
- Reset the LIDAR: disconnect power for 5 seconds

## 📊 Understanding the Visualization

### Color Meanings
- **White (low values 1-127)**: Free space where the robot can move
- **Black (high values 128-255)**: Occupied space (walls, obstacles)
- **Gray (value 0)**: Unknown/unexplored areas
- **Origin (0,0)**: Center of the grid (robot's starting position)

### Statistics
- **Grids**: Number of grid updates sent
- **Size**: Grid dimensions in cells
- **Resolution**: Size of each cell in meters
- **Completion**: Percentage of grid that has been explored

## 🔍 What to Look For

### ✅ Good Signs
- Clear, sharp obstacle boundaries
- Smooth free space areas
- Obstacles match the physical environment
- Circular pattern if robot is stationary
- Grid updates smoothly in real-time

### ❌ Warning Signs (Indicate Problems)
- Obstacles appear in random locations
- Grid is mostly gray (low completion)
- Obstacles are blurry or scattered
- Shapes don't match reality
- Grid appears rotated or mirrored
- Excessive noise (random black/white pixels)

## 📁 File Structure

```
robot/tests/manual_tests/
├── RPLidar_socket_test.py          # LIDAR client (runs on robot)
├── lidar_map_server_helper.py      # Visualization server (runs on PC)
├── verify_imports.py               # Import verification script
├── QUICKSTART.md                   # This file
├── README_OCCUPANCY_GRID_TEST.md   # Detailed documentation
├── CHANGES_SUMMARY.md              # Technical changes explanation
├── test_grid_streaming.sh          # Quick-start script (Linux/Mac)
└── test_grid_streaming.ps1         # Quick-start script (Windows)
```

## 🆘 Need More Help?

1. Read the detailed documentation: `README_OCCUPANCY_GRID_TEST.md`
2. Check what was changed: `CHANGES_SUMMARY.md`
3. Look at the source code in `RPLidar_socket_test.py` (well-commented)

## 💡 Tips

- **Start simple**: Begin with Test 1 (static robot) before trying movement
- **Log everything**: Use `--log-level DEBUG` for detailed output
- **Take screenshots**: Capture the visualization for comparison
- **Test multiple environments**: Try in different rooms to verify consistency
- **Compare with main.py**: Run the full robot system and compare the maps

## ⏭️ Next Steps After Testing

If the grid looks good:
- ✅ The occupancy grid logic is working correctly
- 🔍 Problem may be in particle filter or sensor fusion
- 🔍 Check how pose estimates are used in `main.py`

If the grid looks wrong:
- 🐛 Issue is in the occupancy grid building logic
- 🔍 Check `slam_manager.py` coordinate transformations
- 🔍 Verify `_world_to_cell()` and `_ray_cells()` functions
- 🔍 Check LIDAR angle interpretation

Good luck testing! 🤖

