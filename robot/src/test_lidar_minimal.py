#!/usr/bin/env python3
"""Minimal test script for RPLidar communication issues."""

import serial
import time
import logging
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

def test_serial_communication(port: str):
    """Test basic serial communication with different parameters."""
    
    # Different parameter combinations to try
    configs = [
        {"baudrate": 1000000, "bytesize": 8, "parity": 'N', "stopbits": 1, "timeout": 2},
        {"baudrate": 115200, "bytesize": 8, "parity": 'N', "stopbits": 1, "timeout": 2},
        {"baudrate": 115200, "bytesize": 8, "parity": 'N', "stopbits": 1, "timeout": 5},
        {"baudrate": 256000, "bytesize": 8, "parity": 'N', "stopbits": 1, "timeout": 2},
        {"baudrate": 115200, "bytesize": 8, "parity": 'N', "stopbits": 2, "timeout": 2},
        {"baudrate": 115200, "bytesize": 7, "parity": 'N', "stopbits": 1, "timeout": 2},
        {"baudrate": 9600, "bytesize": 8, "parity": 'N', "stopbits": 1, "timeout": 2},
    ]
    
    for i, config in enumerate(configs):
        print(f"\n--- Test {i+1}: {config} ---")
        
        try:
            with serial.Serial(port, **config) as ser:
                print(f"✓ Serial port opened successfully")
                
                # Clear buffers
                ser.reset_input_buffer()
                ser.reset_output_buffer()
                time.sleep(0.1)
                
                # Send a simple command (get device info)
                cmd = b'\xa5P'  # RPLIDAR_CMD_GET_INFO
                print(f"Sending command: {cmd.hex()}")
                ser.write(cmd)
                time.sleep(0.5)
                
                # Try to read response
                if ser.in_waiting > 0:
                    response = ser.read(ser.in_waiting)
                    print(f"✓ Got response ({len(response)} bytes): {response.hex()}")
                    if len(response) >= 7:  # Minimum expected response
                        print("✓ Response length looks reasonable")
                        return True
                else:
                    print("✗ No response received")
                    
        except Exception as exc:
            print(f"✗ Failed: {exc}")
    
    return False

def test_rplidar_library(port: str):
    """Test with RPLidar library using minimal approach."""
    
    print(f"\n--- Testing RPLidar library ---")
    
    try:
        from rplidar import RPLidar
        
        # Try with shorter timeout and no motor start
        lidar = RPLidar(port, baudrate=1000000, timeout=2.0)
        print("✓ RPLidar object created")
        
        # Give serial port time to settle
        time.sleep(1.0)
        
        try:
            # Clear input using library methods
            try:
                lidar.clear_input()
                time.sleep(0.5)
                print("✓ Buffers cleared")
            except Exception as exc:
                print(f"⚠ Buffer clear warning: {exc}")
            
            # Try to get device info
            info = lidar.get_info()
            print(f"✓ Device info: {info}")
            
            # Try to get health status
            health = lidar.get_health()
            print(f"✓ Device health: Status={health[0]}, Error Code={health[1]}")
            
            return True
            
        except Exception as exc:
            print(f"✗ Communication failed: {exc}")
            return False
            
        finally:
            try:
                lidar.disconnect()
                print("✓ Disconnected")
            except Exception as exc:
                print(f"⚠ Disconnect warning: {exc}")
                
    except Exception as exc:
        print(f"✗ RPLidar library failed: {exc}")
        return False

def scan_and_save_image(port: str, output_dir: str = "logs"):
    """Perform a single scan and save visualization to file."""
    
    print(f"\n--- Scanning and saving image ---")
    
    try:
        from rplidar import RPLidar
        
        # Create output directory if it doesn't exist
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Connect to lidar
        lidar = RPLidar(port, baudrate=1000000, timeout=2.0)
        print("✓ RPLidar object created")
        time.sleep(1.0)
        
        try:
            # Clear buffers
            try:
                lidar.clear_input()
                time.sleep(0.5)
                print("✓ Buffers cleared")
            except Exception as exc:
                print(f"⚠ Buffer clear warning: {exc}")
            
            # Get device info
            info = lidar.get_info()
            print(f"✓ Device info: {info}")
            
            # Start motor and scanning
            print("Starting motor and scan...")
            lidar.start_motor()
            time.sleep(2.0)  # Give motor time to spin up
            
            # Collect one full scan
            scan_data = []
            print("Collecting scan data...")
            
            for i, scan in enumerate(lidar.iter_scans(max_buf_meas=500)):
                scan_data = scan
                print(f"✓ Collected {len(scan_data)} measurements")
                break  # Just get one scan
            
            # Stop motor
            lidar.stop_motor()
            lidar.stop()
            
            if len(scan_data) == 0:
                print("✗ No scan data collected")
                return False
            
            # Process scan data
            angles = np.array([meas[1] for meas in scan_data])
            distances = np.array([meas[2] for meas in scan_data])
            
            # Convert to radians for polar plot
            angles_rad = np.deg2rad(angles)
            
            # Create polar plot
            fig = plt.figure(figsize=(10, 10))
            ax = fig.add_subplot(111, projection='polar')
            
            # Plot scan points
            ax.scatter(angles_rad, distances, c=distances, cmap='viridis', 
                      alpha=0.75, s=2)
            
            ax.set_title(f'RPLidar Scan\n{len(scan_data)} measurements', 
                        pad=20, fontsize=14)
            ax.set_theta_zero_location('N')
            ax.set_theta_direction(-1)
            
            # Add distance grid
            ax.grid(True, alpha=0.3)
            
            # Generate filename with timestamp
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = output_path / f"lidar_scan_{timestamp}.png"
            
            # Save figure
            plt.savefig(filename, dpi=150, bbox_inches='tight')
            plt.close()
            
            print(f"✓ Scan image saved to: {filename}")
            print(f"  - Measurements: {len(scan_data)}")
            print(f"  - Distance range: {distances.min():.1f} - {distances.max():.1f} mm")
            print(f"  - Angle range: {angles.min():.1f}° - {angles.max():.1f}°")
            
            return True
            
        except Exception as exc:
            print(f"✗ Scan failed: {exc}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            try:
                lidar.stop_motor()
                lidar.stop()
                lidar.disconnect()
                print("✓ Disconnected")
            except Exception as exc:
                print(f"⚠ Disconnect warning: {exc}")
                
    except Exception as exc:
        print(f"✗ Scan test failed: {exc}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python test_lidar_minimal.py /dev/ttyUSB0")
        sys.exit(1)
    
    port = sys.argv[1]
    print(f"Testing RPLidar communication on {port}")
    
    # Test 1: Basic serial communication
    serial_works = test_serial_communication(port)
    
    # Test 2: RPLidar library
    if serial_works:
        rplidar_works = test_rplidar_library(port)
    else:
        print("Skipping RPLidar library test due to serial communication failure")
        rplidar_works = False
    
    # Test 3: Scan and save image
    if rplidar_works:
        scan_works = scan_and_save_image(port)
    else:
        print("Skipping scan test due to RPLidar library failure")
        scan_works = False
    
    print(f"\n=== Results ===")
    print(f"Serial communication: {'✓ PASS' if serial_works else '✗ FAIL'}")
    print(f"RPLidar library: {'✓ PASS' if rplidar_works else '✗ FAIL'}")
    print(f"Scan and save image: {'✓ PASS' if scan_works else '✗ FAIL'}")
