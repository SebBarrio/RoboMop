# MPU9250 IMU Refactoring - Migration Guide

## Overview

The MPU9250 IMU implementation has been refactored to use the standard `mpu9250-jmdev` library instead of custom low-level I2C register access. This simplifies the codebase while maintaining all existing functionality.

## What Changed

### 1. Dependencies
- **Added**: `mpu9250-jmdev==1.0.13` to `requirements.txt`
- The library handles all low-level I2C communication and sensor configuration

### 2. MPU9250 Class Constructor
**Before:**
```python
import board
import busio
from sensors.imu import MPU9250

i2c = busio.I2C(board.SCL, board.SDA)
imu = MPU9250(i2c=i2c, sample_rate_hz=100.0, filter_alpha=0.98)
```

**After:**
```python
from sensors.imu import MPU9250

# Simpler initialization - no need for board/busio imports
imu = MPU9250(bus=1, sample_rate_hz=100.0, filter_alpha=0.98)
```

### 3. What Stayed the Same
- ✅ All public API methods (`read_sample()`, `initialize()`, `start()`, `stop()`, `iter_samples()`)
- ✅ All data structures (`ImuSample`, `Vector3`, `Orientation`)
- ✅ Complementary filter implementation and orientation estimation
- ✅ Async/sync dual interface
- ✅ Sample rate and filter alpha configuration

## Installation

Install the new dependency:
```bash
pip install -r requirements.txt
```

Or specifically:
```bash
pip install mpu9250-jmdev==1.0.13
```

## Updated Files

1. **robot/src/sensors/imu.py** - Refactored to use `mpu9250-jmdev` library
2. **robot/tests/manual_tests/mpu9250_socket_test.py** - Updated initialization
3. **robot/tests/unit/test_imu.py** - Updated to mock the new library
4. **robot/requirements.txt** - Added `mpu9250-jmdev` dependency

## Benefits

1. **Simplified codebase** - Removed ~100 lines of low-level register manipulation code
2. **Better maintainability** - Using a well-tested standard library
3. **Community support** - Library is actively maintained with bug fixes
4. **Same functionality** - All features preserved including:
   - Accelerometer, gyroscope, magnetometer reading
   - Temperature measurement
   - Complementary filter for orientation
   - Async/sync interfaces

## Testing

Run the unit tests to verify the refactoring:
```bash
cd robot
pytest tests/unit/test_imu.py -v
```

Run manual tests (requires hardware):
```bash
python tests/manual_tests/mpu9250_socket_test.py <host> <port>
```

## Troubleshooting

### Import Error
If you see `ImportError: No module named 'mpu9250_jmdev'`:
```bash
pip install mpu9250-jmdev==1.0.13
```

### I2C Bus Number
The default I2C bus is `bus=1` (Raspberry Pi). If you're using a different platform:
```python
imu = MPU9250(bus=0, ...)  # Or appropriate bus number
```

### Address
The default I2C address is `0x68`. If your sensor uses `0x69`:
```python
imu = MPU9250(bus=1, address=0x69, ...)
```

## Migration Checklist

- [x] Add `mpu9250-jmdev` to requirements.txt
- [x] Refactor `robot/src/sensors/imu.py` to use standard library
- [x] Update `mpu9250_socket_test.py` initialization
- [x] Update unit tests with new mocking approach
- [ ] Install new dependency: `pip install -r requirements.txt`
- [ ] Run unit tests: `pytest tests/unit/test_imu.py`
- [ ] Test with actual hardware (if available)
