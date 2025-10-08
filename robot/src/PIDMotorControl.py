"""PID Motor Speed Control Test Suite

This program implements PID control for individual motor speed testing.
It runs 4 different test scenarios on each motor and generates plots
showing setpoint vs actual output for analysis.

Test Scenarios:
1. Step response test
2. Ramp response test  
3. Sine wave tracking test
4. Multi-step sequence test

Each test generates two plots:
- Speed tracking (setpoint vs actual speed)
- Position tracking (integrated position)
"""

from __future__ import annotations

import time
import math
import os
from datetime import datetime
from dataclasses import dataclass
from typing import List, Tuple, Optional
from enum import Enum

import board
import busio
from adafruit_pca9685 import PCA9685
from gpiozero import RotaryEncoder

# Use non-interactive backend for headless plotting
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# Pin assignments
MOTOR_CHANNELS: List[Tuple[int, int]] = [(0, 1), (2, 3), (4, 5), (6, 7)]
ENCODER_CHANNELS: List[Tuple[int, int]] = [(13, 26), (5, 6)]
MOTOR_TO_ENCODER_MAP: dict[int, int] = {0: 0, 1: 0, 2: 1, 3: 1}

# Motor parameters
R_OHMS: float = 0.091
KT_NM_PER_A: float = 0.018803
KE_VS_PER_RAD: float = 0.018803
GEAR_RATIO: float = 8.45
SUPPLY_VOLTAGE: float = 12.0
ENCODER_PULSES_PER_REV: int = 400
ENCODER_ON_OUTPUT_SHAFT: bool = True

# Control parameters
PWM_FREQUENCY: int = 1000
PWM_MAX: int = 0xFFFF
CONTROL_INTERVAL: float = 0.02
TEST_DURATION: float = 10.0

# PID gains for speed control (tuned for this system)
SPEED_KP: float = 3.65
SPEED_KI: float = 14.7
SPEED_KD: float = 0.0

class TestType(Enum):
    STEP = "step"
    RAMP = "ramp"
    SINE = "sine"
    MULTI_STEP = "multi_step"

@dataclass
class TestData:
    """Data structure for storing test measurements"""
    time: List[float]
    setpoint: List[float]
    actual_speed: List[float]
    actual_position: List[float]
    control_output: List[float]
    motor_id: int
    test_type: TestType
    # Both encoder outputs for identification
    encoder_0_position: List[float]
    encoder_0_speed: List[float]
    encoder_1_position: List[float]
    encoder_1_speed: List[float]

class PIDController:
    """PID controller for motor speed control"""
    
    def __init__(self, kp: float, ki: float, kd: float, output_limits: Tuple[float, float] = (-12.0, 12.0)):
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.output_limits = output_limits
        
        # Controller state
        self.last_error = 0.0
        self.integral = 0.0
        self.last_time = None
        
    def update(self, setpoint: float, measurement: float, dt: float) -> float:
        """Update PID controller and return control output"""
        error = setpoint - measurement
        
        # Proportional term
        proportional = self.kp * error
        
        # Integral term
        self.integral += error * dt
        integral = self.ki * self.integral
        
        # Derivative term
        if dt > 0:
            derivative = self.kd * (error - self.last_error) / dt
        else:
            derivative = 0.0
            
        # Calculate output
        output = proportional + integral + derivative
        
        # Apply output limits
        output = max(self.output_limits[0], min(self.output_limits[1], output))
        
        # Update state
        self.last_error = error
        
        return output
    
    def reset(self):
        """Reset controller state"""
        self.last_error = 0.0
        self.integral = 0.0
        self.last_time = None

class MotorController:
    """Individual motor controller with encoder feedback"""
    
    def __init__(self, motor_id: int, pca9685: PCA9685, encoders: List[RotaryEncoder]):
        self.motor_id = motor_id
        self.pca9685 = pca9685
        self.encoder_id = MOTOR_TO_ENCODER_MAP[motor_id]
        self.encoder = encoders[self.encoder_id]
        self.all_encoders = encoders  # Keep reference to all encoders
        
        # Motor channels
        self.forward_channel, self.reverse_channel = MOTOR_CHANNELS[motor_id]
        
        # State variables for primary encoder (used for control)
        self.position = 0.0
        self.speed = 0.0
        self.last_position = 0.0
        self.last_time = None
        
        # State variables for both encoders (for logging)
        self.encoder_0_position = 0.0
        self.encoder_0_speed = 0.0
        self.encoder_1_position = 0.0
        self.encoder_1_speed = 0.0
        self.last_encoder_0_position = 0.0
        self.last_encoder_1_position = 0.0
        
        # PID controller
        self.pid = PIDController(SPEED_KP, SPEED_KI, SPEED_KD)
        
    def update_position_and_speed(self, current_time: float):
        """Update position and speed from both encoders"""
        # Read both encoder positions
        encoder_0_pos = self.all_encoders[0].position
        encoder_1_pos = self.all_encoders[1].position
        
        # Convert to radians
        if ENCODER_ON_OUTPUT_SHAFT:
            # Encoders are on output shaft
            self.encoder_0_position = encoder_0_pos * 2 * math.pi
            self.encoder_1_position = encoder_1_pos * 2 * math.pi
        else:
            # Encoders are on motor shaft, apply gear ratio
            self.encoder_0_position = encoder_0_pos * 2 * math.pi * GEAR_RATIO
            self.encoder_1_position = encoder_1_pos * 2 * math.pi * GEAR_RATIO
            
        # Use the primary encoder for control (based on motor mapping)
        self.position = self.encoder_0_position if self.encoder_id == 0 else self.encoder_1_position
            
        # Calculate speeds
        if self.last_time is not None:
            dt = current_time - self.last_time
            if dt > 0:
                self.speed = (self.position - self.last_position) / dt
                self.encoder_0_speed = (self.encoder_0_position - self.last_encoder_0_position) / dt
                self.encoder_1_speed = (self.encoder_1_position - self.last_encoder_1_position) / dt
                
        self.last_position = self.position
        self.last_encoder_0_position = self.encoder_0_position
        self.last_encoder_1_position = self.encoder_1_position
        self.last_time = current_time
        
    def set_voltage(self, voltage: float):
        """Set motor voltage via PWM"""
        # Convert voltage to PWM duty cycle
        duty_cycle = abs(voltage) / SUPPLY_VOLTAGE
        pwm_value = int(duty_cycle * PWM_MAX)
        
        # Clamp PWM value
        pwm_value = max(0, min(PWM_MAX, pwm_value))
        
        if voltage >= 0:
            # Forward direction
            self.pca9685.channels[self.forward_channel].duty_cycle = pwm_value
            self.pca9685.channels[self.reverse_channel].duty_cycle = 0
        else:
            # Reverse direction
            self.pca9685.channels[self.forward_channel].duty_cycle = 0
            self.pca9685.channels[self.reverse_channel].duty_cycle = pwm_value
            
    def stop(self):
        """Stop the motor"""
        self.pca9685.channels[self.forward_channel].duty_cycle = 0
        self.pca9685.channels[self.reverse_channel].duty_cycle = 0
        
    def reset_pid(self):
        """Reset PID controller"""
        self.pid.reset()

class TestSuite:
    """Test suite for motor speed control"""
    
    def __init__(self, motor_controller: MotorController):
        self.motor = motor_controller
        self.test_data: List[TestData] = []
        
    def generate_setpoint(self, test_type: TestType, t: float) -> float:
        """Generate setpoint based on test type and time"""
        if test_type == TestType.STEP:
            # Step response: 0 for first 2s, then 15 rad/s
            return 15.0 if t > 2.0 else 0.0
            
        elif test_type == TestType.RAMP:
            # Ramp response: linear increase from 0 to 20 rad/s over 10s
            return min(20.0, t * 2.0)
            
        elif test_type == TestType.SINE:
            # Sine wave: 10 + 10*sin(0.5*t) rad/s
            return 10.0 + 10.0 * math.sin(0.5 * t)
            
        elif test_type == TestType.MULTI_STEP:
            # Multi-step: 0, 10, 0, -10, 0 rad/s
            if t < 2.0:
                return 0.0
            elif t < 4.0:
                return 10.0
            elif t < 6.0:
                return 0.0
            elif t < 8.0:
                return -10.0
            else:
                return 0.0
                
        return 0.0
        
    def run_test(self, test_type: TestType) -> TestData:
        """Run a single test and return data"""
        print(f"Running {test_type.value} test on motor {self.motor.motor_id}")
        
        # Initialize test data
        test_data = TestData(
            time=[],
            setpoint=[],
            actual_speed=[],
            actual_position=[],
            control_output=[],
            motor_id=self.motor.motor_id,
            test_type=test_type,
            encoder_0_position=[],
            encoder_0_speed=[],
            encoder_1_position=[],
            encoder_1_speed=[]
        )
        
        # Reset motor state
        self.motor.reset_pid()
        self.motor.stop()
        
        # Wait for motor to stop
        time.sleep(0.5)
        
        # Test loop
        start_time = time.time()
        last_control_time = start_time
        
        while time.time() - start_time < TEST_DURATION:
            current_time = time.time() - start_time
            
            # Update motor state
            self.motor.update_position_and_speed(time.time())
            
            # Generate setpoint
            setpoint = self.generate_setpoint(test_type, current_time)
            
            # Control loop (run at specified interval)
            if current_time - (last_control_time - start_time) >= CONTROL_INTERVAL:
                # Calculate control output
                control_output = self.motor.pid.update(setpoint, self.motor.speed, CONTROL_INTERVAL)
                
                # Apply control output
                self.motor.set_voltage(control_output)
                
                last_control_time = time.time()
            
            # Log data
            test_data.time.append(current_time)
            test_data.setpoint.append(setpoint)
            test_data.actual_speed.append(self.motor.speed)
            test_data.actual_position.append(self.motor.position)
            test_data.control_output.append(control_output if 'control_output' in locals() else 0.0)
            test_data.encoder_0_position.append(self.motor.encoder_0_position)
            test_data.encoder_0_speed.append(self.motor.encoder_0_speed)
            test_data.encoder_1_position.append(self.motor.encoder_1_position)
            test_data.encoder_1_speed.append(self.motor.encoder_1_speed)
            
            # Small delay to prevent excessive CPU usage
            time.sleep(0.001)
            
        # Stop motor
        self.motor.stop()
        
        return test_data
        
    def run_all_tests(self) -> List[TestData]:
        """Run all test scenarios"""
        all_data = []
        
        for test_type in TestType:
            data = self.run_test(test_type)
            all_data.append(data)
            
            # Short pause between tests
            time.sleep(1.0)
            
        return all_data

class PlotGenerator:
    """Generate plots for test results"""
    
    @staticmethod
    def plot_test_results(test_data: List[TestData], motor_id: int):
        """Generate plots for all test results"""
        # Create output directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = f"logs/motor_{motor_id}_pid_test_{timestamp}"
        os.makedirs(output_dir, exist_ok=True)
        
        # Create individual plots for each test
        for i, data in enumerate(test_data):
            fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
            
            # Speed plot (primary encoder)
            ax1.plot(data.time, data.setpoint, 'r--', label='Setpoint', linewidth=2)
            ax1.plot(data.time, data.actual_speed, 'b-', label='Actual Speed (Primary)', linewidth=1)
            ax1.set_xlabel('Time (s)')
            ax1.set_ylabel('Speed (rad/s)')
            ax1.set_title(f'Motor {motor_id} - {data.test_type.value.title()} Test - Speed Tracking')
            ax1.legend()
            ax1.grid(True, alpha=0.3)
            
            # Position plot (primary encoder)
            ax2.plot(data.time, data.actual_position, 'g-', label='Position (Primary)', linewidth=1)
            ax2.set_xlabel('Time (s)')
            ax2.set_ylabel('Position (rad)')
            ax2.set_title(f'Motor {motor_id} - {data.test_type.value.title()} Test - Position')
            ax2.legend()
            ax2.grid(True, alpha=0.3)
            
            # Both encoder speeds comparison
            ax3.plot(data.time, data.setpoint, 'r--', label='Setpoint', linewidth=2)
            ax3.plot(data.time, data.encoder_0_speed, 'b-', label='Encoder 0 Speed', linewidth=1)
            ax3.plot(data.time, data.encoder_1_speed, 'orange', label='Encoder 1 Speed', linewidth=1)
            ax3.set_xlabel('Time (s)')
            ax3.set_ylabel('Speed (rad/s)')
            ax3.set_title(f'Motor {motor_id} - {data.test_type.value.title()} Test - Both Encoder Speeds')
            ax3.legend()
            ax3.grid(True, alpha=0.3)
            
            # Both encoder positions comparison
            ax4.plot(data.time, data.encoder_0_position, 'b-', label='Encoder 0 Position', linewidth=1)
            ax4.plot(data.time, data.encoder_1_position, 'orange', label='Encoder 1 Position', linewidth=1)
            ax4.set_xlabel('Time (s)')
            ax4.set_ylabel('Position (rad)')
            ax4.set_title(f'Motor {motor_id} - {data.test_type.value.title()} Test - Both Encoder Positions')
            ax4.legend()
            ax4.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            # Save plot
            filename = f"{output_dir}/motor_{motor_id}_{data.test_type.value}_test.png"
            plt.savefig(filename, dpi=300, bbox_inches='tight')
            plt.close()
            
            print(f"Saved plot: {filename}")
            
        # Create combined plot showing both encoders
        fig, axes = plt.subplots(2, 2, figsize=(16, 12))
        axes = axes.flatten()
        
        for i, data in enumerate(test_data):
            ax = axes[i]
            ax.plot(data.time, data.setpoint, 'r--', label='Setpoint', linewidth=2)
            ax.plot(data.time, data.encoder_0_speed, 'b-', label='Encoder 0 Speed', linewidth=1)
            ax.plot(data.time, data.encoder_1_speed, 'orange', label='Encoder 1 Speed', linewidth=1)
            ax.set_xlabel('Time (s)')
            ax.set_ylabel('Speed (rad/s)')
            ax.set_title(f'{data.test_type.value.title()} Test')
            ax.legend()
            ax.grid(True, alpha=0.3)
            
        plt.suptitle(f'Motor {motor_id} - PID Control Test Results (Both Encoders)', fontsize=16)
        plt.tight_layout()
        
        # Save combined plot
        combined_filename = f"{output_dir}/motor_{motor_id}_combined_results.png"
        plt.savefig(combined_filename, dpi=300, bbox_inches='tight')
        plt.close()
        
        print(f"Saved combined plot: {combined_filename}")
        
        return output_dir

def main():
    """Main execution function"""
    print("PID Motor Speed Control Test Suite")
    print("==================================")
    
    try:
        # Initialize hardware
        print("Initializing hardware...")
        i2c = busio.I2C(board.SCL, board.SDA)
        pca9685 = PCA9685(i2c)
        pca9685.frequency = PWM_FREQUENCY
        
        # Initialize encoders
        encoders = []
        for encoder_pins in ENCODER_CHANNELS:
            encoder = RotaryEncoder(encoder_pins[0], encoder_pins[1])
            encoders.append(encoder)
            
        print("Hardware initialized successfully")
        
        # Test each motor individually
        for motor_id in range(4):
            print(f"\nTesting Motor {motor_id}")
            print("-" * 20)
            
            # Create motor controller
            motor_controller = MotorController(motor_id, pca9685, encoders)
            
            # Create test suite
            test_suite = TestSuite(motor_controller)
            
            # Run all tests
            test_results = test_suite.run_all_tests()
            
            # Generate plots
            plot_generator = PlotGenerator()
            output_dir = plot_generator.plot_test_results(test_results, motor_id)
            
            print(f"Motor {motor_id} testing completed. Results saved to: {output_dir}")
            
            # Pause between motors
            if motor_id < 3:
                print("Pausing before next motor test...")
                time.sleep(2.0)
                
        print("\nAll motor tests completed successfully!")
        
    except Exception as e:
        print(f"Error during testing: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Cleanup
        try:
            pca9685.deinit()
            for encoder in encoders:
                encoder.close()
        except:
            pass

if __name__ == "__main__":
    main()
