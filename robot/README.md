# RoboMop Robot

Autonomous cleaning robot control software running on Raspberry Pi 5.

## Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run robot (requires hardware)
python src/main.py --config config.yaml
```

## Project Structure

```
robot/
├── src/
│   ├── slam/            # SLAM implementation
│   ├── navigation/      # Path planning
│   ├── sensors/         # Hardware interfaces
│   ├── control/         # Motor control
│   ├── communication/   # WebSocket client
│   └── main.py         # Entry point
└── tests/
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── contract/       # Contract tests
```

## Development

- Format code: `black src/ tests/`
- Lint: `pylint src/`
- Type check: `mypy src/`
- Test: `pytest --cov=src`


