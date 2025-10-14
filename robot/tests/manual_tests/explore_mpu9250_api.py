#!/usr/bin/env python3
"""Explore the mpu9250-jmdev library API to understand available methods."""

import sys

try:
    from mpu9250_jmdev.mpu_9250 import MPU9250
    from mpu9250_jmdev import registers
    
    print("✓ Successfully imported mpu9250_jmdev modules")
    print()
    
    print("=" * 60)
    print("MPU9250 class attributes and methods:")
    print("=" * 60)
    for attr in dir(MPU9250):
        if not attr.startswith('_'):
            print(f"  {attr}")
    print()
    
    print("=" * 60)
    print("registers module contents:")
    print("=" * 60)
    for attr in dir(registers):
        if not attr.startswith('_'):
            print(f"  {attr}")
    print()
    
    # Try to instantiate
    print("=" * 60)
    print("Trying to instantiate MPU9250:")
    print("=" * 60)
    try:
        mpu = MPU9250(
            address_ak=0x0C,
            address_mpu_master=0x68,
            address_mpu_slave=None,
            bus=1,
            gfs=0,  # Try with default values
            afs=0,
            mfs=1,
            mode=0x06
        )
        print("✓ MPU9250 instantiated successfully")
        print()
        
        print("=" * 60)
        print("MPU9250 instance attributes:")
        print("=" * 60)
        for attr in dir(mpu):
            if not attr.startswith('_') and not callable(getattr(mpu, attr)):
                try:
                    value = getattr(mpu, attr)
                    print(f"  {attr} = {value}")
                except:
                    print(f"  {attr} = <error reading>")
        print()
        
        print("=" * 60)
        print("MPU9250 instance methods:")
        print("=" * 60)
        for attr in dir(mpu):
            if not attr.startswith('_') and callable(getattr(mpu, attr)):
                print(f"  {attr}()")
        print()
        
    except Exception as e:
        print(f"✗ Failed to instantiate: {e}")
        print()
        
        # Print the __init__ signature
        import inspect
        print("MPU9250.__init__ signature:")
        try:
            sig = inspect.signature(MPU9250.__init__)
            print(f"  {sig}")
        except:
            print("  <unable to get signature>")
    
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

