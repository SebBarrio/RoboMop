#!/usr/bin/env python3
"""Motor-Encoder Diagnostic Test

This program tests each motor individually to determine:
1. Which encoder(s) respond to each motor
2. The direction of encoder counts relative to motor voltage polarity
3. Whether the motor-encoder mapping matches ControlLoopTest.py assumptions

Usage:
    sudo python3 MotorEncoderDiagnostic.py

The test runs each motor at 20% duty cycle for 2 seconds and monitors both encoders.
"""

import time
import math
import board
import busio
from adafruit_pca9685 import PCA9685
from gpiozero import RotaryEncoder

# Constants from ControlLoopTest.py
MOTOR_CHANNELS = ((0, 1), (2, 3), (4, 5), (6, 7))  # (forward, reverse) for motors 0-3
ENCODER_PINS = ((5, 6), (13, 26))  # (pin_a, pin_b) for encoders 0-1
ENCODER_PPR = 400
PWM_FREQUENCY = 1000
PWM_MAX = 0xFFFF
TEST_DUTY = 0.20  # 20% duty cycle
TEST_DURATION = 2.0  # seconds
PAUSE_BETWEEN_TESTS = 1.0  # seconds

# Expected mapping from ControlLoopTest.py
EXPECTED_MOTOR_TO_ENCODER = {0: 0, 1: 0, 2: 1, 3: 1}


class MotorEncoderDiagnostic:
    def __init__(self):
        print("=" * 70)
        print("Motor-Encoder Diagnostic Test")
        print("=" * 70)
        print("\nInitializing hardware...")

        # Initialize I2C and PWM
        self.i2c = busio.I2C(board.SCL, board.SDA)
        self.pwm = PCA9685(self.i2c)
        self.pwm.frequency = PWM_FREQUENCY

        # Initialize encoders
        self.encoders = []
        for idx, (pin_a, pin_b) in enumerate(ENCODER_PINS):
            encoder = RotaryEncoder(pin_a, pin_b, max_steps=0)
            self.encoders.append(encoder)
            print(f"  Encoder {idx}: pins {pin_a} (A), {pin_b} (B)")

        # Store results
        self.results = []

        print("\nHardware initialized successfully!")
        print(f"\nTest parameters:")
        print(f"  Motor duty cycle: {TEST_DUTY*100:.0f}%")
        print(f"  Test duration: {TEST_DURATION} seconds")
        print(f"  Encoder resolution: {ENCODER_PPR} pulses/rev")
        print("=" * 70)

    def stop_all_motors(self):
        """Stop all motors by setting all PWM channels to 0."""
        for fwd_ch, rev_ch in MOTOR_CHANNELS:
            self.pwm.channels[fwd_ch].duty_cycle = 0
            self.pwm.channels[rev_ch].duty_cycle = 0

    def test_motor(self, motor_index):
        """Test a single motor and determine which encoder responds."""
        fwd_ch, rev_ch = MOTOR_CHANNELS[motor_index]

        print(f"\n{'='*70}")
        print(f"Testing Motor {motor_index} (PWM channels {fwd_ch}/{rev_ch})")
        print(f"{'='*70}")

        # Record initial encoder positions
        initial_counts = [enc.steps for enc in self.encoders]
        print(f"Initial encoder counts: {initial_counts}")

        # Turn on motor at test duty cycle (forward direction)
        duty_value = int(PWM_MAX * TEST_DUTY)
        self.pwm.channels[fwd_ch].duty_cycle = duty_value
        self.pwm.channels[rev_ch].duty_cycle = 0
        print(f"Motor ON (forward at {TEST_DUTY*100:.0f}% duty)...")

        # Monitor encoders during test
        start_time = time.time()
        last_print_time = start_time

        while time.time() - start_time < TEST_DURATION:
            current_time = time.time()
            if current_time - last_print_time >= 0.5:  # Print every 0.5 seconds
                current_counts = [enc.steps for enc in self.encoders]
                deltas = [curr - init for curr, init in zip(current_counts, initial_counts)]
                elapsed = current_time - start_time
                print(f"  {elapsed:.1f}s: Encoder counts = {current_counts}, deltas = {deltas}")
                last_print_time = current_time

        # Stop motor
        self.pwm.channels[fwd_ch].duty_cycle = 0

        # Record final encoder positions
        time.sleep(0.1)  # Let motor fully stop
        final_counts = [enc.steps for enc in self.encoders]
        delta_counts = [final - initial for final, initial in zip(final_counts, initial_counts)]

        print(f"\nMotor OFF")
        print(f"Final encoder counts: {final_counts}")
        print(f"Delta counts: {delta_counts}")

        # Analyze results
        responding_encoders = []
        for idx, delta in enumerate(delta_counts):
            if abs(delta) > 5:  # Threshold to ignore noise
                direction = "FORWARD (+)" if delta > 0 else "REVERSE (-)"
                speed_rps = abs(delta) / ENCODER_PPR / TEST_DURATION
                speed_rad_s = speed_rps * 2 * math.pi
                responding_encoders.append(
                    {
                        "encoder_index": idx,
                        "delta": delta,
                        "direction": direction,
                        "speed_rps": speed_rps,
                        "speed_rad_s": speed_rad_s,
                    }
                )
                print(f"  ✓ Encoder {idx} responded: {delta} counts, {direction}")
                print(f"    Speed: {speed_rps:.2f} rev/s = {speed_rad_s:.2f} rad/s")

        if not responding_encoders:
            print(f"  ✗ No encoder response detected! Check connections.")

        result = {
            "motor_index": motor_index,
            "motor_channels": (fwd_ch, rev_ch),
            "responding_encoders": responding_encoders,
            "all_deltas": delta_counts,
        }

        return result

    def run_tests(self):
        """Test all motors sequentially."""
        print(f"\n\n{'#'*70}")
        print("STARTING MOTOR TESTS")
        print(f"{'#'*70}")

        for motor_idx in range(4):
            result = self.test_motor(motor_idx)
            self.results.append(result)

            if motor_idx < 3:  # Don't pause after last test
                print(f"\nPausing {PAUSE_BETWEEN_TESTS} second(s) before next test...")
                time.sleep(PAUSE_BETWEEN_TESTS)

        print(f"\n{'#'*70}")
        print("ALL TESTS COMPLETE")
        print(f"{'#'*70}")

    def generate_report(self):
        """Generate comprehensive diagnostic report."""
        print("\n\n")
        print("=" * 70)
        print("DIAGNOSTIC REPORT")
        print("=" * 70)

        # Summary table
        print("\n" + "─" * 70)
        print("MOTOR-ENCODER MAPPING COMPARISON")
        print("─" * 70)
        print(f"{'Motor':<8} {'Expected':<12} {'Observed':<12} {'Direction':<15} {'Status':<15}")
        print("─" * 70)

        issues = []

        for result in self.results:
            motor_idx = result["motor_index"]
            expected_enc = EXPECTED_MOTOR_TO_ENCODER[motor_idx]

            if not result["responding_encoders"]:
                observed_enc = "NONE"
                direction = "N/A"
                status = "✗ NO RESPONSE"
                issues.append(f"Motor {motor_idx}: No encoder response detected!")
            elif len(result["responding_encoders"]) > 1:
                encs = [str(e["encoder_index"]) for e in result["responding_encoders"]]
                observed_enc = ",".join(encs)
                direction = "Multiple"
                status = "✗ MULTIPLE"
                issues.append(f"Motor {motor_idx}: Multiple encoders responded!")
            else:
                enc_data = result["responding_encoders"][0]
                observed_enc = enc_data["encoder_index"]
                direction = enc_data["direction"]

                if observed_enc == expected_enc:
                    if "FORWARD" in direction:
                        status = "✓ CORRECT"
                    else:
                        status = "✗ REVERSED"
                        issues.append(
                            f"Motor {motor_idx}: Direction reversed (encoder counts negative)"
                        )
                else:
                    status = "✗ WRONG ENC"
                    issues.append(
                        f"Motor {motor_idx}: Wrong encoder (expected {expected_enc}, got {observed_enc})"
                    )

            print(
                f"{motor_idx:<8} {expected_enc:<12} {str(observed_enc):<12} {direction:<15} {status:<15}"
            )

        print("─" * 70)

        # Detailed issues and recommendations
        if issues:
            print("\n" + "─" * 70)
            print("ISSUES FOUND")
            print("─" * 70)
            for issue in issues:
                print(f"  • {issue}")
        else:
            print("\n✓ All motors and encoders are correctly mapped and directionally correct!")

        # Generate specific recommendations
        print("\n" + "─" * 70)
        print("RECOMMENDATIONS")
        print("─" * 70)

        recommendations = []

        for result in self.results:
            motor_idx = result["motor_index"]
            expected_enc = EXPECTED_MOTOR_TO_ENCODER[motor_idx]

            if not result["responding_encoders"]:
                recommendations.append(
                    f"\nMotor {motor_idx}:\n"
                    f"  - Check physical connections for motor and encoder\n"
                    f"  - Verify motor power supply\n"
                    f"  - Check encoder wiring to GPIO pins"
                )
            elif len(result["responding_encoders"]) > 1:
                recommendations.append(
                    f"\nMotor {motor_idx}:\n"
                    f"  - Multiple encoders responded - possible wiring short\n"
                    f"  - Check for crossed encoder signals"
                )
            else:
                enc_data = result["responding_encoders"][0]
                observed_enc = enc_data["encoder_index"]
                delta = enc_data["delta"]

                if observed_enc != expected_enc:
                    recommendations.append(
                        f"\nMotor {motor_idx}:\n"
                        f"  - Wrong encoder detected (expected {expected_enc}, got {observed_enc})\n"
                        f"  FIX: Update MOTOR_TO_ENCODER_MAP in ControlLoopTest.py:\n"
                        f"       Change: {motor_idx}: {expected_enc}  →  {motor_idx}: {observed_enc}"
                    )

                if delta < 0:  # Reverse direction
                    fwd_ch, rev_ch = result["motor_channels"]
                    recommendations.append(
                        f"\nMotor {motor_idx}:\n"
                        f"  - Direction is reversed (encoder counts negative)\n"
                        f"  FIX OPTIONS:\n"
                        f"    1. Swap motor wiring (+ and - on motor terminals)\n"
                        f"    2. OR swap PWM channels in ControlLoopTest.py:\n"
                        f"       Change: ({fwd_ch}, {rev_ch})  →  ({rev_ch}, {fwd_ch})\n"
                        f"    3. OR swap encoder pins in ControlLoopTest.py:\n"
                        f"       Encoder {observed_enc}: swap pin A and B values"
                    )

        if recommendations:
            for rec in recommendations:
                print(rec)
        else:
            print("\n✓ No changes needed - all mappings are correct!")

        # Code changes section
        print("\n" + "─" * 70)
        print("SUGGESTED CODE CHANGES FOR ControlLoopTest.py")
        print("─" * 70)

        code_changes = []
        new_motor_channels = list(MOTOR_CHANNELS)
        new_motor_to_encoder = EXPECTED_MOTOR_TO_ENCODER.copy()

        for result in self.results:
            motor_idx = result["motor_index"]
            if result["responding_encoders"] and len(result["responding_encoders"]) == 1:
                enc_data = result["responding_encoders"][0]
                observed_enc = enc_data["encoder_index"]
                delta = enc_data["delta"]

                # Check encoder mapping
                if observed_enc != EXPECTED_MOTOR_TO_ENCODER[motor_idx]:
                    new_motor_to_encoder[motor_idx] = observed_enc
                    code_changes.append(f"  - Motor {motor_idx}: Map to Encoder {observed_enc}")

                # Check direction
                if delta < 0:
                    fwd_ch, rev_ch = new_motor_channels[motor_idx]
                    new_motor_channels[motor_idx] = (rev_ch, fwd_ch)
                    code_changes.append(
                        f"  - Motor {motor_idx}: Swap channels ({fwd_ch}, {rev_ch}) → ({rev_ch}, {fwd_ch})"
                    )

        if code_changes:
            print("\nApply these changes:\n")
            for change in code_changes:
                print(change)

            print(f"\n# Updated MOTOR_CHANNELS:")
            print(f"MOTOR_CHANNELS: Sequence[tuple[int, int]] = {tuple(new_motor_channels)}")

            print(f"\n# Updated MOTOR_TO_ENCODER_MAP:")
            print(f"MOTOR_TO_ENCODER_MAP: dict[int, int] = {new_motor_to_encoder}")
        else:
            print("\n✓ No code changes needed!")

        print("\n" + "=" * 70)
        print("END OF REPORT")
        print("=" * 70)

    def cleanup(self):
        """Clean up hardware resources."""
        print("\nCleaning up...")
        self.stop_all_motors()
        for encoder in self.encoders:
            encoder.close()
        self.pwm.deinit()
        print("Cleanup complete!")


def main():
    diagnostic = MotorEncoderDiagnostic()

    try:
        diagnostic.run_tests()
        diagnostic.generate_report()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user!")
    except Exception as e:
        print(f"\n\nError during test: {e}")
        import traceback

        traceback.print_exc()
    finally:
        diagnostic.cleanup()


if __name__ == "__main__":
    main()
