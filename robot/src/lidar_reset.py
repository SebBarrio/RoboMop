#!/usr/bin/env python3
"""Hard reset utility for RPLidar devices."""

import time
import serial
import logging

def hard_reset_lidar(serial_port: str):
    """Perform a hard reset of the lidar by sending raw commands."""
    
    logging.info("Attempting hard reset of lidar on %s", serial_port)
    
    # Try multiple baudrates
    for baudrate in [115200, 256000, 230400, 128000]:
        logging.info("Trying reset with baudrate %d", baudrate)
        
        try:
            with serial.Serial(serial_port, baudrate, timeout=1.0) as ser:
                # Clear any existing data
                ser.reset_input_buffer()
                ser.reset_output_buffer()
                time.sleep(0.1)
                
                # Send stop motor command
                ser.write(b'\xa5\xf0\x02\x00\x00W')
                time.sleep(0.5)
                
                # Send stop scan command
                ser.write(b'\xa5%')
                time.sleep(0.5)
                
                # Send reset command (if supported)
                ser.write(b'\xa5\x40')
                time.sleep(1.0)
                
                # Clear buffers again
                ser.reset_input_buffer()
                ser.reset_output_buffer()
                time.sleep(1.0)
                
                logging.info("Reset commands sent with baudrate %d", baudrate)
                
        except Exception as exc:
            logging.debug("Reset failed with baudrate %d: %s", baudrate, exc)
            continue
    
    logging.info("Hard reset complete. Wait a few seconds before reconnecting.")

if __name__ == "__main__":
    import sys
    
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    
    if len(sys.argv) != 2:
        print("Usage: python lidar_reset.py /dev/ttyUSB0")
        sys.exit(1)
        
    hard_reset_lidar(sys.argv[1])
