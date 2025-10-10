#!/usr/bin/env python3
"""Direct low-level RPLidar scanning test to bypass library issues."""

import serial
import time
import struct
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

# RPLidar Protocol Constants
SYNC_BYTE = 0xA5
SYNC_BYTE2 = 0x5A

# Commands
CMD_STOP = 0x25
CMD_RESET = 0x40
CMD_SCAN = 0x20
CMD_EXPRESS_SCAN = 0x82
CMD_GET_INFO = 0x50
CMD_GET_HEALTH = 0x52

def send_command(ser, cmd):
    """Send command to RPLidar."""
    packet = struct.pack('BB', SYNC_BYTE, cmd)
    ser.write(packet)

def read_response_descriptor(ser, timeout=2.0):
    """Read response descriptor."""
    start_time = time.time()
    
    # Wait for sync bytes
    while time.time() - start_time < timeout:
        if ser.in_waiting >= 7:
            header = ser.read(7)
            if header[0] == SYNC_BYTE and header[1] == SYNC_BYTE2:
                dsize = struct.unpack('<I', header[2:6])[0]
                dtype = header[6]
                return dsize, dtype
    
    raise TimeoutError("No response descriptor received")

def direct_scan(port: str, duration: float = 2.0, output_dir: str = "logs"):
    """Perform direct low-level scanning."""
    
    print(f"\n--- Direct Low-Level Scanning ---")
    
    try:
        # Open serial port
        ser = serial.Serial(
            port=port,
            baudrate=1000000,
            timeout=1.0
        )
        print(f"✓ Serial port opened: {port}")
        
        # Reset device
        print("Resetting device...")
        send_command(ser, CMD_RESET)
        time.sleep(2.0)
        ser.reset_input_buffer()
        
        # Get device info
        print("Getting device info...")
        send_command(ser, CMD_GET_INFO)
        time.sleep(0.1)
        
        try:
            dsize, dtype = read_response_descriptor(ser)
            info_data = ser.read(dsize)
            model = info_data[0]
            firmware_minor = info_data[1]
            firmware_major = info_data[2]
            hardware = info_data[3]
            serial_num = info_data[4:20].hex().upper()
            print(f"✓ Model: {model}, Firmware: {firmware_major}.{firmware_minor}, "
                  f"Hardware: {hardware}")
        except Exception as e:
            print(f"⚠ Could not read device info: {e}")
        
        # Clear buffers
        ser.reset_input_buffer()
        time.sleep(0.1)
        
        # Start standard scan
        print("Starting standard scan...")
        send_command(ser, CMD_SCAN)
        time.sleep(0.1)
        
        # Read response descriptor
        try:
            dsize, dtype = read_response_descriptor(ser)
            print(f"✓ Scan response: dsize={dsize}, dtype=0x{dtype:02x}")
        except Exception as e:
            print(f"⚠ No scan descriptor: {e}")
        
        # Collect scan data
        scan_data = []
        start_time = time.time()
        
        print(f"Collecting scan data for {duration} seconds...")
        
        while time.time() - start_time < duration:
            if ser.in_waiting >= 5:  # Each measurement is 5 bytes
                raw = ser.read(5)
                
                # Parse measurement packet
                # Byte 0: Quality (bits 0-5) and Start flag (bit 0 of first byte)
                # Byte 1-2: Angle (15 bits)
                # Byte 3-4: Distance (16 bits)
                
                start_flag = (raw[0] & 0x01) != 0
                quality = (raw[0] >> 2) & 0x3F
                
                angle_raw = (raw[2] << 8) | raw[1]
                angle = ((angle_raw >> 1) & 0x7FFF) / 64.0  # Convert to degrees
                
                distance_raw = (raw[4] << 8) | raw[3]
                distance = distance_raw / 4.0  # Convert to mm
                
                # Only keep valid measurements
                if distance > 0 and quality > 0:
                    scan_data.append({
                        'start': start_flag,
                        'quality': quality,
                        'angle': angle,
                        'distance': distance
                    })
        
        # Stop scan
        print("Stopping scan...")
        send_command(ser, CMD_STOP)
        time.sleep(0.1)
        
        # Close serial port
        ser.close()
        print(f"✓ Collected {len(scan_data)} measurements")
        
        if len(scan_data) == 0:
            print("✗ No valid measurements collected")
            return False
        
        # Process and visualize
        angles = np.array([m['angle'] for m in scan_data])
        distances = np.array([m['distance'] for m in scan_data])
        qualities = np.array([m['quality'] for m in scan_data])
        
        # Create polar plot
        fig = plt.figure(figsize=(12, 10))
        
        # Main scan plot
        ax1 = fig.add_subplot(221, projection='polar')
        scatter = ax1.scatter(np.deg2rad(angles), distances, 
                            c=qualities, cmap='viridis', 
                            alpha=0.75, s=2)
        ax1.set_title(f'Direct RPLidar Scan\n{len(scan_data)} measurements', 
                     pad=20, fontsize=12)
        ax1.set_theta_zero_location('N')
        ax1.set_theta_direction(-1)
        ax1.grid(True, alpha=0.3)
        plt.colorbar(scatter, ax=ax1, label='Quality')
        
        # Distance histogram
        ax2 = fig.add_subplot(222)
        ax2.hist(distances, bins=50, alpha=0.7, edgecolor='black')
        ax2.set_xlabel('Distance (mm)')
        ax2.set_ylabel('Count')
        ax2.set_title('Distance Distribution')
        ax2.grid(True, alpha=0.3)
        
        # Angle histogram
        ax3 = fig.add_subplot(223)
        ax3.hist(angles, bins=72, alpha=0.7, edgecolor='black')
        ax3.set_xlabel('Angle (degrees)')
        ax3.set_ylabel('Count')
        ax3.set_title('Angle Distribution')
        ax3.grid(True, alpha=0.3)
        
        # Quality histogram
        ax4 = fig.add_subplot(224)
        ax4.hist(qualities, bins=30, alpha=0.7, edgecolor='black')
        ax4.set_xlabel('Quality')
        ax4.set_ylabel('Count')
        ax4.set_title('Quality Distribution')
        ax4.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        # Save figure
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = output_path / f"lidar_direct_scan_{timestamp}.png"
        plt.savefig(filename, dpi=150, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Scan image saved to: {filename}")
        print(f"  - Measurements: {len(scan_data)}")
        print(f"  - Distance range: {distances.min():.1f} - {distances.max():.1f} mm")
        print(f"  - Angle range: {angles.min():.1f}° - {angles.max():.1f}°")
        print(f"  - Quality range: {qualities.min()} - {qualities.max()}")
        
        return True
        
    except Exception as exc:
        print(f"✗ Direct scan failed: {exc}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python test_lidar_direct.py /dev/ttyUSB0")
        sys.exit(1)
    
    port = sys.argv[1]
    success = direct_scan(port, duration=2.0)
    
    print(f"\n=== Result ===")
    print(f"Direct scan: {'✓ PASS' if success else '✗ FAIL'}")

