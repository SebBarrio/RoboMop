#!/usr/bin/env python3
"""
MPU9250 3D Visualization Client
Receives IMU data from socket and displays 3D orientation visualization.

Requirements:
    pip install matplotlib numpy scipy

Usage:
    python mpu9250_visualizer.py [--host HOST] [--port PORT] [--history SECONDS]
"""

import socket
import json
import argparse
import threading
import time
import gc
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
        self.data_queue = Queue(maxsize=50)  # Reduced from 100 to prevent memory buildup
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

    def __init__(self, receiver: IMUDataReceiver, history_seconds: float = 10.0):
        """
        Initialize the visualizer.

        Args:
            receiver: IMUDataReceiver instance
            history_seconds: Number of seconds of data to keep in history
        """
        self.receiver = receiver
        
        # Orientation state (quaternion)
        self.orientation = Rotation.from_quat([0, 0, 0, 1])
        
        # Initialization state
        self.orientation_initialized = False
        self.reference_orientation = None  # Store initial orientation as reference zero
        self.init_buffer = []
        self.init_samples_needed = 100  # Collect 100 samples (~2 seconds at 50Hz)
        
        # Gyroscope integration
        self.last_timestamp = None
        
        # Complementary filter parameters
        self.alpha = 0.98  # Weight for gyroscope (0.98 = 98% gyro, 2% accel)
        self.init_alpha = 0.5  # Higher accel weight during initialization (faster convergence)
        self.convergence_frames = 100  # Continue converging for 100 frames after init
        
        # Memory management
        self.history_seconds = history_seconds
        self.frame_count = 0
        
        # Setup plot
        self.fig = plt.figure(figsize=(12, 10))
        self.ax = self.fig.add_subplot(221, projection='3d')
        self.ax_accel = self.fig.add_subplot(222)
        self.ax_gyro = self.fig.add_subplot(223)
        self.ax_mag = self.fig.add_subplot(224)
        
        # Data buffers for plots (using fixed-size deques for efficient memory management)
        self.accel_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.gyro_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.mag_history = {'x': [], 'y': [], 'z': [], 't': []}
        self.start_time = time.time()
        
        # Initialize 3D plot
        self.setup_3d_plot()
        
        # Initialize 2D plots
        self.setup_2d_plots()
        
        # Line objects for efficient updating (avoid recreating on each frame)
        self.accel_lines = None
        self.gyro_lines = None
        self.mag_lines = None

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
        
        # Initialize orientation from first accelerometer readings
        if not self.orientation_initialized:
            self.init_buffer.append(accel)
            
            if len(self.init_buffer) >= self.init_samples_needed:
                # Average the accelerometer readings for robust initialization
                avg_accel = np.mean(self.init_buffer, axis=0)
                accel_norm = np.linalg.norm(avg_accel)
                
                if accel_norm > 0.1:
                    avg_accel_normalized = avg_accel / accel_norm
                    
                    # Calculate initial orientation from accelerometer
                    # Gravity vector in world frame (pointing down)
                    gravity = np.array([0, 0, -1])
                    
                    # Find rotation that aligns gravity with measured acceleration
                    v = np.cross(gravity, avg_accel_normalized)
                    s = np.linalg.norm(v)
                    c = np.dot(gravity, avg_accel_normalized)
                    
                    if s > 1e-6:
                        # Rodrigues' rotation formula
                        v_skew = np.array([
                            [0, -v[2], v[1]],
                            [v[2], 0, -v[0]],
                            [-v[1], v[0], 0]
                        ])
                        R = np.eye(3) + v_skew + v_skew @ v_skew * ((1 - c) / (s ** 2))
                        self.orientation = Rotation.from_matrix(R)
                    
                    # Save this as the reference orientation (zero point)
                    self.reference_orientation = self.orientation
                    self.orientation_initialized = True
                    self.last_timestamp = timestamp
                    print(f"✓ Orientation initialized from {self.init_samples_needed} samples")
                    print(f"  Display will show orientation relative to initial position")
                    
            return
        
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
        
        # Compute tilt correction from accelerometer (ONLY pitch and roll, NOT yaw)
        accel_norm = np.linalg.norm(accel)
        if accel_norm > 0.5:  # Only apply correction if acceleration is reasonable
            accel_normalized = accel / accel_norm
            
            # Use adaptive alpha during convergence phase
            frames_since_init = self.frame_count - self.init_samples_needed
            if frames_since_init < self.convergence_frames:
                current_alpha = self.init_alpha
            else:
                current_alpha = self.alpha
            
            # Extract current orientation's Z-axis (up direction)
            current_up = gyro_orientation.as_matrix()[:, 2]
            
            # Calculate tilt error (difference between measured and expected gravity)
            # Measured gravity direction (inverted because accel measures opposite of gravity)
            measured_up = -accel_normalized
            
            # Compute correction axis and angle (only for tilt, preserves heading)
            correction_axis = np.cross(current_up, measured_up)
            correction_axis_norm = np.linalg.norm(correction_axis)
            
            if correction_axis_norm > 1e-6:
                # Normalize correction axis
                correction_axis = correction_axis / correction_axis_norm
                
                # Correction angle (small for stability)
                correction_angle = np.arcsin(min(1.0, correction_axis_norm))
                
                # Scale correction by accelerometer weight
                correction_angle *= (1 - current_alpha)
                
                # Apply tilt correction
                tilt_correction = Rotation.from_rotvec(correction_axis * correction_angle)
                self.orientation = tilt_correction * gyro_orientation
            else:
                self.orientation = gyro_orientation
        else:
            # If acceleration is too high/low (motion), trust gyro only
            self.orientation = gyro_orientation

    def update_plot(self, frame):
        """
        Update the visualization (called by FuncAnimation).

        Args:
            frame: Frame number (unused)
        """
        # Periodic garbage collection (every 100 frames = ~2 seconds at 50Hz)
        self.frame_count += 1
        if self.frame_count % 100 == 0:
            gc.collect()
        
        # Get latest data
        data = self.receiver.get_latest_data()
        
        if data is None:
            return
        
        # Update orientation estimate
        self.update_orientation(data)
        
        # Update 3D orientation plot
        self.ax.cla()
        self.ax.set_xlim([-1, 1])
        self.ax.set_ylim([-1, 1])
        self.ax.set_zlim([-1, 1])
        self.ax.set_xlabel('X')
        self.ax.set_ylabel('Y')
        self.ax.set_zlabel('Z')
        
        # Dynamic title showing initialization/convergence status
        if not self.orientation_initialized:
            progress = len(self.init_buffer)
            self.ax.set_title(f'IMU Orientation [Initializing: {progress}/{self.init_samples_needed}]')
        else:
            frames_since_init = self.frame_count - self.init_samples_needed
            if frames_since_init < self.convergence_frames:
                remaining = self.convergence_frames - frames_since_init
                self.ax.set_title(f'IMU Orientation - Relative [Converging: {remaining} frames]')
            else:
                self.ax.set_title('IMU Orientation - Relative to Start Position')
        
        # Calculate relative orientation (rotation from reference to current)
        # This makes the display always start at identity (zero rotation)
        if self.reference_orientation is not None:
            relative_orientation = self.reference_orientation.inv() * self.orientation
        else:
            relative_orientation = self.orientation
        
        # Get rotation matrix
        R = relative_orientation.as_matrix()
        
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
        
        # Handle magnetometer (may be None)
        if data.get('magnetometer'):
            self.mag_history['x'].append(data['magnetometer']['x'])
            self.mag_history['y'].append(data['magnetometer']['y'])
            self.mag_history['z'].append(data['magnetometer']['z'])
            self.mag_history['t'].append(current_time)
        else:
            self.mag_history['x'].append(0.0)
            self.mag_history['y'].append(0.0)
            self.mag_history['z'].append(0.0)
            self.mag_history['t'].append(current_time)
        
        # Trim history based on time window (keeps only recent data)
        cutoff_time = current_time - self.history_seconds
        for hist in [self.accel_history, self.gyro_history, self.mag_history]:
            # Find first index where time > cutoff_time
            times = hist['t']
            if times and times[0] < cutoff_time:
                # Binary search for efficiency
                start_idx = 0
                for i, t in enumerate(times):
                    if t >= cutoff_time:
                        start_idx = i
                        break
                
                # Trim all arrays
                for key in hist:
                    hist[key] = hist[key][start_idx:]
        
        # Update 2D plots
        self.ax_accel.cla()
        # Add data point count to title for memory monitoring
        num_points = len(self.accel_history['t'])
        self.ax_accel.set_title(f'Accelerometer (m/s²) - {num_points} points')
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
            blit=False,
            cache_frame_data=False  # Disable frame caching to avoid unbounded memory
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
    parser.add_argument(
        '--history',
        type=float,
        default=10.0,
        help='Number of seconds of data to display (default: 10.0, max: 30.0)'
    )

    args = parser.parse_args()
    
    # Clamp history to reasonable values (1-30 seconds)
    history_seconds = max(1.0, min(30.0, args.history))
    if history_seconds != args.history:
        print(f"Warning: History clamped to {history_seconds} seconds (valid range: 1-30)")

    # Create receiver
    receiver = IMUDataReceiver(args.host, args.port)
    
    # Start receiving data
    if not receiver.start():
        print("Failed to start receiver")
        return
    
    print(f"Receiving data... (showing last {history_seconds} seconds)")
    print("")
    print("⚠️  IMPORTANT: Keep sensor STILL for first 2 seconds during initialization!")
    print("   The initial position will be set as the reference (0,0,0)")
    print("")
    print("Close window to exit.")
    
    try:
        # Create and run visualizer
        visualizer = IMUVisualizer(receiver, history_seconds=history_seconds)
        visualizer.run()
        
    except KeyboardInterrupt:
        print("\nShutting down...")
        
    finally:
        receiver.stop()


if __name__ == '__main__':
    main()

