#!/usr/bin/env python3
"""
MPU9250 3D Visualization Client
Receives IMU data from socket and displays 3D orientation visualization.

Requirements:
    pip install matplotlib numpy scipy

Usage:
    python mpu9250_visualizer.py [--host HOST] [--port PORT]
"""

import socket
import json
import argparse
import threading
import time
from queue import Queue, Empty
from typing import Optional, Dict, Any

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from mpl_toolkits.mplot3d import Axes3D
from scipy.spatial.transform import Rotation


class IMUDataReceiver:
    """Receives IMU data from TCP socket."""

    def __init__(self, host: str, port: int):
        """
        Initialize the socket receiver.

        Args:
            host: Server host address
            port: Server port number
        """
        self.host = host
        self.port = port
        self.socket = None
        self.running = False
        self.data_queue = Queue(maxsize=100)
        self.receive_thread = None

    def connect(self) -> bool:
        """
        Connect to the socket server.

        Returns:
            True if successful, False otherwise
        """
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.host, self.port))
            print(f"Connected to {self.host}:{self.port}")
            return True
            
        except Exception as e:
            print(f"Error connecting to server: {e}")
            return False

    def receive_data(self):
        """Receive data from socket (runs in separate thread)."""
        buffer = ""
        
        while self.running:
            try:
                # Receive data
                chunk = self.socket.recv(4096).decode('utf-8')
                
                if not chunk:
                    print("Connection closed by server")
                    break
                
                buffer += chunk
                
                # Process complete messages (delimited by newline)
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    
                    try:
                        data = json.loads(line)
                        
                        # Add to queue (drop oldest if full)
                        if self.data_queue.full():
                            try:
                                self.data_queue.get_nowait()
                            except Empty:
                                pass
                        
                        self.data_queue.put(data)
                        
                    except json.JSONDecodeError as e:
                        print(f"Error decoding JSON: {e}")
                        
            except Exception as e:
                print(f"Error receiving data: {e}")
                break

    def start(self):
        """Start receiving data in background thread."""
        if not self.connect():
            return False
        
        self.running = True
        self.receive_thread = threading.Thread(target=self.receive_data, daemon=True)
        self.receive_thread.start()
        return True

    def stop(self):
        """Stop receiving data."""
        self.running = False
        
        if self.socket:
            self.socket.close()
        
        if self.receive_thread:
            self.receive_thread.join(timeout=1.0)

    def get_latest_data(self) -> Optional[Dict[str, Any]]:
        """
        Get the latest data from queue.

        Returns:
            Latest sensor data or None if queue is empty
        """
        try:
            return self.data_queue.get_nowait()
        except Empty:
            return None


class IMUVisualizer:
    """3D visualization of IMU orientation."""

    def __init__(self, receiver: IMUDataReceiver):
        """
        Initialize the visualizer.

        Args:
            receiver: IMUDataReceiver instance
        """
        self.receiver = receiver
        
        # Orientation state (quaternion)
        self.orientation = Rotation.from_quat([0, 0, 0, 1])
        
        # Gyroscope integration
        self.last_timestamp = None
        
        # Complementary filter parameters
        self.alpha = 0.98  # Weight for gyroscope (0.98 = 98% gyro, 2% accel)
        
        # Setup plot
        self.fig = plt.figure(figsize=(12, 10))
        self.ax = self.fig.add_subplot(221, projection='3d')
        self.ax_accel = self.fig.add_subplot(222)
        self.ax_gyro = self.fig.add_subplot(223)
        self.ax_mag = self.fig.add_subplot(224)
        
        # Data buffers for plots
        self.max_history = 200
        self.accel_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.gyro_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.mag_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.start_time = time.time()
        
        # Initialize 3D plot
        self.setup_3d_plot()
        
        # Initialize 2D plots
        self.setup_2d_plots()

    def setup_3d_plot(self):
        """Setup the 3D orientation plot."""
        self.ax.set_xlim([-1, 1])
        self.ax.set_ylim([-1, 1])
        self.ax.set_zlim([-1, 1])
        self.ax.set_xlabel('X')
        self.ax.set_ylabel('Y')
        self.ax.set_zlabel('Z')
        self.ax.set_title('IMU Orientation')
        
        # Create coordinate frame vectors
        self.axis_length = 0.8
        self.x_axis = None
        self.y_axis = None
        self.z_axis = None

    def setup_2d_plots(self):
        """Setup the 2D sensor data plots."""
        # Accelerometer plot
        self.ax_accel.set_title('Accelerometer (m/s²)')
        self.ax_accel.set_xlabel('Time (s)')
        self.ax_accel.set_ylabel('Acceleration')
        self.ax_accel.grid(True)
        
        # Gyroscope plot
        self.ax_gyro.set_title('Gyroscope (°/s)')
        self.ax_gyro.set_xlabel('Time (s)')
        self.ax_gyro.set_ylabel('Angular Velocity')
        self.ax_gyro.grid(True)
        
        # Magnetometer plot
        self.ax_mag.set_title('Magnetometer (µT)')
        self.ax_mag.set_xlabel('Time (s)')
        self.ax_mag.set_ylabel('Magnetic Field')
        self.ax_mag.grid(True)

    def update_orientation(self, data: Dict[str, Any]):
        """
        Update orientation estimate from sensor data.

        Args:
            data: Sensor data dictionary
        """
        timestamp = data['timestamp']
        
        # Get sensor data
        accel = np.array([
            data['accelerometer']['x'],
            data['accelerometer']['y'],
            data['accelerometer']['z']
        ])
        
        gyro = np.array([
            data['gyroscope']['x'],
            data['gyroscope']['y'],
            data['gyroscope']['z']
        ])
        
        # Convert gyro from degrees/s to radians/s
        gyro_rad = np.radians(gyro)
        
        # Initialize timestamp
        if self.last_timestamp is None:
            self.last_timestamp = timestamp
            return
        
        # Calculate dt
        dt = timestamp - self.last_timestamp
        self.last_timestamp = timestamp
        
        if dt <= 0 or dt > 1.0:  # Skip invalid dt
            return
        
        # Integrate gyroscope (prediction step)
        rotation_delta = Rotation.from_rotvec(gyro_rad * dt)
        gyro_orientation = self.orientation * rotation_delta
        
        # Compute orientation from accelerometer (correction step)
        accel_norm = np.linalg.norm(accel)
        if accel_norm > 0:
            accel_normalized = accel / accel_norm
            
            # Calculate tilt from accelerometer
            # Assuming Z-axis should point up (opposite to gravity)
            gravity = np.array([0, 0, -1])
            
            # Find rotation that aligns gravity with measured acceleration
            v = np.cross(gravity, accel_normalized)
            s = np.linalg.norm(v)
            c = np.dot(gravity, accel_normalized)
            
            if s > 1e-6:  # Avoid division by zero
                # Rodrigues' rotation formula
                v_skew = np.array([
                    [0, -v[2], v[1]],
                    [v[2], 0, -v[0]],
                    [-v[1], v[0], 0]
                ])
                R = np.eye(3) + v_skew + v_skew @ v_skew * ((1 - c) / (s ** 2))
                accel_orientation = Rotation.from_matrix(R)
                
                # Complementary filter
                self.orientation = Rotation.from_quat(
                    self.alpha * gyro_orientation.as_quat() +
                    (1 - self.alpha) * accel_orientation.as_quat()
                )
                self.orientation = Rotation.from_quat(
                    self.orientation.as_quat() / np.linalg.norm(self.orientation.as_quat())
                )
            else:
                self.orientation = gyro_orientation
        else:
            self.orientation = gyro_orientation

    def update_plot(self, frame):
        """
        Update the visualization (called by FuncAnimation).

        Args:
            frame: Frame number (unused)
        """
        # Get latest data
        data = self.receiver.get_latest_data()
        
        if data is None:
            return
        
        # Update orientation estimate
        self.update_orientation(data)
        
        # Update 3D orientation plot
        self.ax.cla()
        self.setup_3d_plot()
        
        # Get rotation matrix
        R = self.orientation.as_matrix()
        
        # Transform and plot axes
        origin = np.array([0, 0, 0])
        
        # X-axis (red)
        x_vec = R @ np.array([self.axis_length, 0, 0])
        self.ax.quiver(*origin, *x_vec, color='r', arrow_length_ratio=0.2, linewidth=3, label='X')
        
        # Y-axis (green)
        y_vec = R @ np.array([0, self.axis_length, 0])
        self.ax.quiver(*origin, *y_vec, color='g', arrow_length_ratio=0.2, linewidth=3, label='Y')
        
        # Z-axis (blue)
        z_vec = R @ np.array([0, 0, self.axis_length])
        self.ax.quiver(*origin, *z_vec, color='b', arrow_length_ratio=0.2, linewidth=3, label='Z')
        
        self.ax.legend()
        
        # Update data history
        current_time = time.time() - self.start_time
        
        self.accel_history['x'].append(data['accelerometer']['x'])
        self.accel_history['y'].append(data['accelerometer']['y'])
        self.accel_history['z'].append(data['accelerometer']['z'])
        self.accel_history['t'].append(current_time)
        
        self.gyro_history['x'].append(data['gyroscope']['x'])
        self.gyro_history['y'].append(data['gyroscope']['y'])
        self.gyro_history['z'].append(data['gyroscope']['z'])
        self.gyro_history['t'].append(current_time)
        
        self.mag_history['x'].append(data['magnetometer']['x'])
        self.mag_history['y'].append(data['magnetometer']['y'])
        self.mag_history['z'].append(data['magnetometer']['z'])
        self.mag_history['t'].append(current_time)
        
        # Trim history
        for hist in [self.accel_history, self.gyro_history, self.mag_history]:
            if len(hist['t']) > self.max_history:
                for key in hist:
                    hist[key] = hist[key][-self.max_history:]
        
        # Update 2D plots
        self.ax_accel.cla()
        self.ax_accel.set_title('Accelerometer (m/s²)')
        self.ax_accel.set_xlabel('Time (s)')
        self.ax_accel.set_ylabel('Acceleration')
        self.ax_accel.grid(True)
        self.ax_accel.plot(self.accel_history['t'], self.accel_history['x'], 'r-', label='X')
        self.ax_accel.plot(self.accel_history['t'], self.accel_history['y'], 'g-', label='Y')
        self.ax_accel.plot(self.accel_history['t'], self.accel_history['z'], 'b-', label='Z')
        self.ax_accel.legend(loc='upper right')
        
        self.ax_gyro.cla()
        self.ax_gyro.set_title('Gyroscope (°/s)')
        self.ax_gyro.set_xlabel('Time (s)')
        self.ax_gyro.set_ylabel('Angular Velocity')
        self.ax_gyro.grid(True)
        self.ax_gyro.plot(self.gyro_history['t'], self.gyro_history['x'], 'r-', label='X')
        self.ax_gyro.plot(self.gyro_history['t'], self.gyro_history['y'], 'g-', label='Y')
        self.ax_gyro.plot(self.gyro_history['t'], self.gyro_history['z'], 'b-', label='Z')
        self.ax_gyro.legend(loc='upper right')
        
        self.ax_mag.cla()
        self.ax_mag.set_title('Magnetometer (µT)')
        self.ax_mag.set_xlabel('Time (s)')
        self.ax_mag.set_ylabel('Magnetic Field')
        self.ax_mag.grid(True)
        self.ax_mag.plot(self.mag_history['t'], self.mag_history['x'], 'r-', label='X')
        self.ax_mag.plot(self.mag_history['t'], self.mag_history['y'], 'g-', label='Y')
        self.ax_mag.plot(self.mag_history['t'], self.mag_history['z'], 'b-', label='Z')
        self.ax_mag.legend(loc='upper right')

    def run(self):
        """Start the visualization."""
        plt.tight_layout()
        
        # Create animation (50 Hz update rate)
        self.anim = FuncAnimation(
            self.fig,
            self.update_plot,
            interval=20,  # 20ms = 50Hz
            blit=False
        )
        
        plt.show()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Receive and visualize MPU9250 sensor data'
    )
    parser.add_argument(
        '--host',
        type=str,
        default='localhost',
        help='Server host address (default: localhost)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=9250,
        help='Server port number (default: 9250)'
    )

    args = parser.parse_args()

    # Create receiver
    receiver = IMUDataReceiver(args.host, args.port)
    
    # Start receiving data
    if not receiver.start():
        print("Failed to start receiver")
        return
    
    print("Receiving data... Close window to exit.")
    
    try:
        # Create and run visualizer
        visualizer = IMUVisualizer(receiver)
        visualizer.run()
        
    except KeyboardInterrupt:
        print("\nShutting down...")
        
    finally:
        receiver.stop()


if __name__ == '__main__':
    main()

