#!/usr/bin/env python3
"""Verify that all required imports work correctly before running the main test."""

import sys
from pathlib import Path

# Add parent directories to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

print("Verifying imports...")
print("-" * 50)

try:
    print("✓ Importing numpy...", end=" ")
    import numpy as np
    print(f"OK (version {np.__version__})")
except ImportError as e:
    print(f"FAILED: {e}")
    sys.exit(1)

try:
    print("✓ Importing matplotlib...", end=" ")
    import matplotlib
    print(f"OK (version {matplotlib.__version__})")
except ImportError as e:
    print(f"FAILED: {e}")
    sys.exit(1)

try:
    print("✓ Importing sensors.lidar...", end=" ")
    from sensors.lidar import RPLidarSerial, LidarMeasurement
    print("OK")
except ImportError as e:
    print(f"FAILED: {e}")
    print("  Make sure you're running from robot/tests/manual_tests/")
    sys.exit(1)

try:
    print("✓ Importing slam.occupancy_grid...", end=" ")
    from slam.occupancy_grid import OccupancyGrid
    print("OK")
except ImportError as e:
    print(f"FAILED: {e}")
    print("  Make sure you're running from robot/tests/manual_tests/")
    sys.exit(1)

try:
    print("✓ Importing serial...", end=" ")
    import serial
    print(f"OK (version {serial.VERSION})")
except ImportError as e:
    print(f"FAILED: {e}")
    print("  Install with: pip install pyserial")
    sys.exit(1)

print("-" * 50)
print("All imports successful!")
print()

# Quick occupancy grid test
print("Testing OccupancyGrid creation...")
try:
    grid = OccupancyGrid(
        width=100,
        height=100,
        resolution=0.05,
        origin=(-2.5, -2.5, 0.0),
    )
    print(f"✓ Created {grid.width}x{grid.height} grid at {grid.resolution}m resolution")
    print(f"  Origin: ({grid.origin[0]:.2f}, {grid.origin[1]:.2f})")
    print(f"  Completion: {grid.completion_ratio*100:.1f}%")
    
    # Test setting a cell
    grid.set_cell(50, 50, 220)
    value = grid.get_cell(50, 50)
    assert value == 220, f"Expected 220, got {value}"
    print(f"✓ Grid cell operations working correctly")
    
except Exception as e:
    print(f"FAILED: {e}")
    sys.exit(1)

print("-" * 50)
print("✅ All tests passed! You can now run the streaming scripts.")
print()
print("Next steps:")
print("  1. Start the server: python lidar_map_server_helper.py 0.0.0.0 5555 --visualize")
print("  2. Start the client: python RPLidar_socket_test.py /dev/ttyUSB0 <SERVER_IP> 5555")

