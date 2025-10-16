#!/usr/bin/env python3
"""
Quick test script to verify MPU6500 is working properly.
Shows real-time sensor readings for 10 seconds.
"""

import time
import sys

try:
    from smbus2 import SMBus
except ImportError:
    print("Error: smbus2 library not found.")
    print("Install with: pip install smbus2")
    sys.exit(1)


def test_mpu6500():
    """Test MPU6500 basic functionality."""
    
    bus = SMBus(1)
    mpu_address = 0x68
    
    # Check WHO_AM_I
    who_am_i = bus.read_byte_data(mpu_address, 0x75)
    sensor_types = {
        0x70: "MPU6500 (6-axis: accel + gyro)",
        0x71: "MPU9250 (9-axis: accel + gyro + mag)",
        0x73: "MPU9255 (9-axis: accel + gyro + mag)"
    }
    sensor_name = sensor_types.get(who_am_i, f"Unknown (0x{who_am_i:02x})")
    
    print("=" * 60)
    print(f"Detected sensor: {sensor_name}")
    print("=" * 60)
    
    if who_am_i == 0x70:
        print("\n✓ This is an MPU6500 - magnetometer NOT available")
        print("  The MPU6500 only has accelerometer + gyroscope")
        print("  For magnetometer, you need MPU9250/9255\n")
    elif who_am_i in [0x71, 0x73]:
        print("\n✓ This sensor has magnetometer support\n")
    
    # Wake up sensor
    bus.write_byte_data(mpu_address, 0x6B, 0x00)
    time.sleep(0.1)
    
    # Enable DLPF (41Hz bandwidth)
    bus.write_byte_data(mpu_address, 0x1A, 0x03)
    bus.write_byte_data(mpu_address, 0x1D, 0x03)
    
    print("Reading sensor data for 10 seconds...")
    print("Keep sensor still to verify calibration quality\n")
    print(f"{'Time':<6} {'Accel X':>8} {'Accel Y':>8} {'Accel Z':>8} {'Gyro X':>8} {'Gyro Y':>8} {'Gyro Z':>8}")
    print("-" * 70)
    
    start_time = time.time()
    
    while time.time() - start_time < 10:
        # Read sensor data
        data = bus.read_i2c_block_data(mpu_address, 0x3B, 14)
        
        # Parse accelerometer (m/s²)
        accel_x = ((data[0] << 8) | data[1])
        if accel_x >= 0x8000:
            accel_x = -((65535 - accel_x) + 1)
        accel_x = (accel_x / 16384.0) * 9.80665
        
        accel_y = ((data[2] << 8) | data[3])
        if accel_y >= 0x8000:
            accel_y = -((65535 - accel_y) + 1)
        accel_y = (accel_y / 16384.0) * 9.80665
        
        accel_z = ((data[4] << 8) | data[5])
        if accel_z >= 0x8000:
            accel_z = -((65535 - accel_z) + 1)
        accel_z = (accel_z / 16384.0) * 9.80665
        
        # Parse gyroscope (°/s)
        gyro_x = ((data[8] << 8) | data[9])
        if gyro_x >= 0x8000:
            gyro_x = -((65535 - gyro_x) + 1)
        gyro_x = gyro_x / 131.0
        
        gyro_y = ((data[10] << 8) | data[11])
        if gyro_y >= 0x8000:
            gyro_y = -((65535 - gyro_y) + 1)
        gyro_y = gyro_y / 131.0
        
        gyro_z = ((data[12] << 8) | data[13])
        if gyro_z >= 0x8000:
            gyro_z = -((65535 - gyro_z) + 1)
        gyro_z = gyro_z / 131.0
        
        elapsed = time.time() - start_time
        print(f"{elapsed:5.1f}s {accel_x:8.2f} {accel_y:8.2f} {accel_z:8.2f} {gyro_x:8.2f} {gyro_y:8.2f} {gyro_z:8.2f}")
        
        time.sleep(0.2)
    
    bus.close()
    
    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)
    print("\nExpected results when sensor is STILL:")
    print("  - Accel Z should be ~9.8 m/s² (gravity)")
    print("  - Accel X, Y should be near 0")
    print("  - Gyro X, Y, Z should be near 0 (±1°/s drift is normal)")
    print("\nIf gyro values are constantly high (>5°/s), sensor may be faulty")


if __name__ == '__main__':
    try:
        test_mpu6500()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()

