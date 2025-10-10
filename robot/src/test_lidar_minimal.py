#!/usr/bin/env python3
"""Minimal test script for RPLidar communication issues."""

import serial
import time
import logging

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
        lidar = RPLidar(port, baudrate=115200, timeout=1.0)
        
        # Just try to connect without getting info
        print("✓ RPLidar object created")
        
        try:
            # Clear input without using library methods
            lidar._serial.reset_input_buffer()
            lidar._serial.reset_output_buffer()
            time.sleep(1.0)
            print("✓ Buffers cleared manually")
            
            # Try to get info with manual timeout
            info = lidar.get_info()
            print(f"✓ Device info: {info}")
            return True
            
        except Exception as exc:
            print(f"✗ get_info failed: {exc}")
            return False
            
        finally:
            try:
                lidar.disconnect()
            except:
                pass
                
    except Exception as exc:
        print(f"✗ RPLidar library failed: {exc}")
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
    
    print(f"\n=== Results ===")
    print(f"Serial communication: {'✓ PASS' if serial_works else '✗ FAIL'}")
    print(f"RPLidar library: {'✓ PASS' if rplidar_works else '✗ FAIL'}")
