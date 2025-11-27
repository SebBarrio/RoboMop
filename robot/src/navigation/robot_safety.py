"""Robot safety module for footprint management and raw LIDAR obstacle avoidance.

This module provides:
1. RobotFootprint: Defines the robot's physical dimensions as a square safety area
2. LidarObstacleDetector: Real-time obstacle detection using raw LIDAR scans

The obstacle detection uses raw LIDAR measurements instead of the occupancy grid
for faster, more responsive collision avoidance during navigation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import numpy as np


@dataclass(frozen=True, slots=True)
class RobotFootprint:
    """Defines the robot's physical dimensions as a square safety area.
    
    The footprint is centered on the robot's origin (LIDAR position).
    All dimensions are in meters.
    
    Attributes:
        width: Robot width (side-to-side), in meters.
        length: Robot length (front-to-back), in meters.
        safety_margin: Additional buffer around the robot for collision avoidance.
        center_offset_x: X offset from LIDAR to robot center (positive = forward).
        center_offset_y: Y offset from LIDAR to robot center (positive = left).
    """
    
    width: float = 0.35  # 35cm default width
    length: float = 0.40  # 40cm default length
    safety_margin: float = 0.10  # 10cm safety buffer
    center_offset_x: float = 0.0  # LIDAR at center by default
    center_offset_y: float = 0.0
    
    def __post_init__(self) -> None:
        if self.width <= 0:
            raise ValueError("width must be positive")
        if self.length <= 0:
            raise ValueError("length must be positive")
        if self.safety_margin < 0:
            raise ValueError("safety_margin must be non-negative")
    
    @property
    def total_width(self) -> float:
        """Total width including safety margin."""
        return self.width + 2 * self.safety_margin
    
    @property
    def total_length(self) -> float:
        """Total length including safety margin."""
        return self.length + 2 * self.safety_margin
    
    @property
    def inscribed_radius(self) -> float:
        """Radius of the largest circle that fits inside the footprint (for A* inflation)."""
        return min(self.total_width, self.total_length) / 2.0
    
    @property
    def circumscribed_radius(self) -> float:
        """Radius of the smallest circle that contains the entire footprint."""
        half_w = self.total_width / 2.0
        half_l = self.total_length / 2.0
        return math.hypot(half_w, half_l)
    
    def inflation_cells(self, resolution: float) -> int:
        """Calculate the number of grid cells to inflate obstacles for pathfinding.
        
        Uses the circumscribed radius to ensure the robot can rotate freely at any
        point along the planned path.
        
        Args:
            resolution: Grid cell size in meters.
            
        Returns:
            Number of cells to inflate around obstacles.
        """
        if resolution <= 0:
            raise ValueError("resolution must be positive")
        return int(math.ceil(self.circumscribed_radius / resolution))
    
    def get_corners(self, x: float, y: float, theta: float) -> List[Tuple[float, float]]:
        """Get the four corners of the robot footprint in world coordinates.
        
        Args:
            x: Robot x position (LIDAR position).
            y: Robot y position (LIDAR position).
            theta: Robot heading in radians.
            
        Returns:
            List of (x, y) tuples for each corner, starting from front-right
            and going counter-clockwise.
        """
        half_w = self.total_width / 2.0
        half_l = self.total_length / 2.0
        
        # Corners in robot frame (relative to LIDAR position)
        # Adjusted for center offset
        cx, cy = self.center_offset_x, self.center_offset_y
        local_corners = [
            (cx + half_l, cy - half_w),   # Front-right
            (cx + half_l, cy + half_w),   # Front-left
            (cx - half_l, cy + half_w),   # Rear-left
            (cx - half_l, cy - half_w),   # Rear-right
        ]
        
        # Transform to world frame
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        world_corners = []
        for lx, ly in local_corners:
            wx = x + cos_t * lx - sin_t * ly
            wy = y + sin_t * lx + cos_t * ly
            world_corners.append((wx, wy))
        
        return world_corners


@dataclass(slots=True)
class ObstacleZone:
    """Describes an obstacle detected by the LIDAR.
    
    Attributes:
        angle: Angle to obstacle center in radians (robot frame, 0 = forward).
        distance: Distance to closest point in meters.
        arc_width: Angular width of the obstacle in radians.
        point_count: Number of LIDAR points in this obstacle cluster.
    """
    
    angle: float
    distance: float
    arc_width: float = 0.0
    point_count: int = 1


@dataclass(slots=True)
class CollisionThreat:
    """Imminent collision threat detected by the obstacle detector.
    
    Attributes:
        zone: The obstacle zone that poses a threat.
        time_to_collision: Estimated time to collision in seconds (if moving toward it).
        severity: Threat level from 0.0 (minor) to 1.0 (imminent collision).
        direction: 'front', 'left', 'right', or 'rear'.
    """
    
    zone: ObstacleZone
    time_to_collision: float
    severity: float
    direction: str


@dataclass
class LidarObstacleDetector:
    """Real-time obstacle detection using raw LIDAR scans.
    
    This class processes raw LIDAR measurements to detect obstacles near the robot
    and provides collision avoidance recommendations. It operates independently of
    the occupancy grid for faster response times.
    
    Attributes:
        footprint: Robot footprint for collision checking.
        critical_distance: Distance at which emergency stop is triggered (meters).
        warning_distance: Distance at which slowdown is recommended (meters).
        min_quality: Minimum LIDAR quality score to consider a measurement valid.
        cluster_angle_threshold: Maximum angle gap to consider points as same obstacle.
    """
    
    footprint: RobotFootprint = field(default_factory=RobotFootprint)
    critical_distance: float = 0.20  # 20cm - emergency stop zone
    warning_distance: float = 0.50   # 50cm - slowdown zone
    min_quality: int = 5             # Ignore very low quality readings
    cluster_angle_threshold: float = math.radians(10.0)  # 10 degrees
    
    def __post_init__(self) -> None:
        if self.critical_distance <= 0:
            raise ValueError("critical_distance must be positive")
        if self.warning_distance <= self.critical_distance:
            raise ValueError("warning_distance must be greater than critical_distance")
    
    def detect_obstacles(
        self,
        scan: Sequence[Tuple[float, float, int]],  # (angle_rad, distance_m, quality)
        *,
        max_range: float = 5.0,
    ) -> List[ObstacleZone]:
        """Detect obstacles from raw LIDAR scan data.
        
        Args:
            scan: List of (angle_radians, distance_m, quality) tuples.
            max_range: Maximum range to consider (filters out far objects).
            
        Returns:
            List of detected obstacle zones sorted by distance.
        """
        # Filter valid measurements
        valid_points: List[Tuple[float, float]] = []
        for angle, distance, quality in scan:
            if quality >= self.min_quality and 0 < distance < max_range:
                valid_points.append((angle, distance))
        
        if not valid_points:
            return []
        
        # Sort by angle for clustering
        valid_points.sort(key=lambda p: p[0])
        
        # Cluster nearby points into obstacle zones
        zones: List[ObstacleZone] = []
        cluster: List[Tuple[float, float]] = [valid_points[0]]
        
        for i in range(1, len(valid_points)):
            angle, distance = valid_points[i]
            prev_angle, prev_dist = valid_points[i - 1]
            
            # Check if this point belongs to the current cluster
            angle_diff = abs(self._wrap_angle(angle - prev_angle))
            dist_diff = abs(distance - prev_dist)
            
            # Points are in same cluster if close in angle and similar distance
            same_cluster = (
                angle_diff < self.cluster_angle_threshold and
                dist_diff < 0.3  # 30cm distance tolerance
            )
            
            if same_cluster:
                cluster.append((angle, distance))
            else:
                # Finalize current cluster
                if cluster:
                    zones.append(self._cluster_to_zone(cluster))
                cluster = [(angle, distance)]
        
        # Don't forget the last cluster
        if cluster:
            zones.append(self._cluster_to_zone(cluster))
        
        # Sort by distance (closest first)
        zones.sort(key=lambda z: z.distance)
        return zones
    
    def check_path_clearance(
        self,
        scan: Sequence[Tuple[float, float, int]],
        robot_x: float,
        robot_y: float,
        robot_theta: float,
        *,
        direction_angle: float = 0.0,  # 0 = forward, pi/2 = left
        cone_half_angle: float = math.pi / 6,  # 30 degree cone
    ) -> Tuple[float, List[ObstacleZone]]:
        """Check clearance in a specific direction using raw LIDAR data.
        
        This method checks for obstacles within a cone in the specified direction
        and returns the minimum clearance distance.
        
        Args:
            scan: Raw LIDAR scan as (angle_rad, distance_m, quality) tuples.
            robot_x: Robot X position (not used, for API consistency).
            robot_y: Robot Y position (not used, for API consistency).
            robot_theta: Robot heading (not used - scan is in robot frame).
            direction_angle: Direction to check relative to robot forward.
            cone_half_angle: Half-width of the detection cone.
            
        Returns:
            Tuple of (minimum_clearance_meters, list_of_obstacles_in_cone).
        """
        min_clearance = float('inf')
        obstacles_in_cone: List[ObstacleZone] = []
        
        for angle, distance, quality in scan:
            if quality < self.min_quality or distance <= 0:
                continue
            
            # Check if this point is within the cone
            angle_diff = abs(self._wrap_angle(angle - direction_angle))
            if angle_diff <= cone_half_angle:
                # Adjust clearance for robot footprint
                # The obstacle might hit a corner of the robot
                effective_distance = self._compute_effective_clearance(
                    angle, distance, direction_angle
                )
                
                if effective_distance < min_clearance:
                    min_clearance = effective_distance
                
                if effective_distance < self.warning_distance:
                    obstacles_in_cone.append(ObstacleZone(
                        angle=angle,
                        distance=distance,
                        arc_width=0.0,
                        point_count=1,
                    ))
        
        return min_clearance, obstacles_in_cone
    
    def compute_safe_velocity(
        self,
        scan: Sequence[Tuple[float, float, int]],
        desired_linear: float,
        desired_angular: float,
        *,
        max_linear: float = 0.3,
        max_angular: float = 0.8,
    ) -> Tuple[float, float, Optional[CollisionThreat]]:
        """Compute safe velocity commands considering obstacles.
        
        This method scales down velocity commands based on obstacle proximity
        and returns a collision threat if one exists.
        
        Args:
            scan: Raw LIDAR scan as (angle_rad, distance_m, quality) tuples.
            desired_linear: Desired linear velocity (m/s, positive = forward).
            desired_angular: Desired angular velocity (rad/s, positive = CCW).
            max_linear: Maximum allowed linear velocity.
            max_angular: Maximum allowed angular velocity.
            
        Returns:
            Tuple of (safe_linear, safe_angular, collision_threat_or_none).
        """
        # Check front clearance for forward motion
        front_clearance, front_obstacles = self.check_path_clearance(
            scan, 0, 0, 0,
            direction_angle=0.0,
            cone_half_angle=math.pi / 4,  # 45 degree cone forward
        )
        
        # Check rear clearance for backward motion
        rear_clearance, rear_obstacles = self.check_path_clearance(
            scan, 0, 0, 0,
            direction_angle=math.pi,
            cone_half_angle=math.pi / 4,
        )
        
        # Check side clearances for rotation
        left_clearance, _ = self.check_path_clearance(
            scan, 0, 0, 0,
            direction_angle=math.pi / 2,
            cone_half_angle=math.pi / 6,
        )
        right_clearance, _ = self.check_path_clearance(
            scan, 0, 0, 0,
            direction_angle=-math.pi / 2,
            cone_half_angle=math.pi / 6,
        )
        
        safe_linear = desired_linear
        safe_angular = desired_angular
        threat: Optional[CollisionThreat] = None
        
        # Scale linear velocity based on clearance
        if desired_linear > 0:
            # Moving forward
            if front_clearance <= self.critical_distance:
                safe_linear = 0.0
                if front_obstacles:
                    threat = CollisionThreat(
                        zone=front_obstacles[0],
                        time_to_collision=0.0,
                        severity=1.0,
                        direction='front',
                    )
            elif front_clearance < self.warning_distance:
                # Linear interpolation for smooth slowdown
                scale = (front_clearance - self.critical_distance) / (
                    self.warning_distance - self.critical_distance
                )
                safe_linear = desired_linear * scale
                if front_obstacles:
                    ttc = front_clearance / max(abs(desired_linear), 0.01)
                    threat = CollisionThreat(
                        zone=front_obstacles[0],
                        time_to_collision=ttc,
                        severity=1.0 - scale,
                        direction='front',
                    )
        elif desired_linear < 0:
            # Moving backward
            if rear_clearance <= self.critical_distance:
                safe_linear = 0.0
                if rear_obstacles:
                    threat = CollisionThreat(
                        zone=rear_obstacles[0],
                        time_to_collision=0.0,
                        severity=1.0,
                        direction='rear',
                    )
            elif rear_clearance < self.warning_distance:
                scale = (rear_clearance - self.critical_distance) / (
                    self.warning_distance - self.critical_distance
                )
                safe_linear = desired_linear * scale
                if rear_obstacles:
                    ttc = rear_clearance / max(abs(desired_linear), 0.01)
                    threat = CollisionThreat(
                        zone=rear_obstacles[0],
                        time_to_collision=ttc,
                        severity=1.0 - scale,
                        direction='rear',
                    )
        
        # Scale angular velocity based on side clearance
        side_clearance = min(left_clearance, right_clearance)
        if side_clearance < self.footprint.circumscribed_radius:
            # Very tight space - reduce rotation speed
            rotation_scale = max(0.2, side_clearance / self.footprint.circumscribed_radius)
            safe_angular = desired_angular * rotation_scale
        
        # Clamp to limits
        safe_linear = max(-max_linear, min(max_linear, safe_linear))
        safe_angular = max(-max_angular, min(max_angular, safe_angular))
        
        return safe_linear, safe_angular, threat
    
    def get_emergency_stop_zones(
        self,
        scan: Sequence[Tuple[float, float, int]],
    ) -> List[ObstacleZone]:
        """Get all obstacles within the emergency stop distance.
        
        Args:
            scan: Raw LIDAR scan as (angle_rad, distance_m, quality) tuples.
            
        Returns:
            List of obstacle zones that require immediate attention.
        """
        emergency_zones: List[ObstacleZone] = []
        
        for angle, distance, quality in scan:
            if quality < self.min_quality or distance <= 0:
                continue
            
            effective = self._compute_effective_clearance(angle, distance, 0.0)
            if effective <= self.critical_distance:
                emergency_zones.append(ObstacleZone(
                    angle=angle,
                    distance=distance,
                    arc_width=0.0,
                    point_count=1,
                ))
        
        return emergency_zones
    
    def _compute_effective_clearance(
        self,
        obstacle_angle: float,
        obstacle_distance: float,
        travel_direction: float,
    ) -> float:
        """Compute effective clearance considering robot footprint.
        
        The effective clearance is the distance to the obstacle minus the
        robot's extent in that direction.
        """
        # Compute which part of the robot would hit this obstacle
        relative_angle = self._wrap_angle(obstacle_angle - travel_direction)
        
        # Use the footprint dimensions to compute how much clearance we need
        # For a rectangular robot, this depends on the angle
        half_w = self.footprint.total_width / 2.0
        half_l = self.footprint.total_length / 2.0
        
        # Simplified: use the inscribed radius for conservative estimate
        # A more accurate calculation would trace the actual footprint outline
        robot_extent = self.footprint.inscribed_radius
        
        # For angles close to forward/back, length matters more
        # For angles close to sides, width matters more
        if abs(relative_angle) < math.pi / 4:
            robot_extent = half_l
        elif abs(relative_angle) > 3 * math.pi / 4:
            robot_extent = half_l
        else:
            robot_extent = half_w
        
        return obstacle_distance - robot_extent
    
    def _cluster_to_zone(self, cluster: List[Tuple[float, float]]) -> ObstacleZone:
        """Convert a cluster of points to an obstacle zone."""
        if not cluster:
            raise ValueError("Cluster cannot be empty")
        
        angles = [p[0] for p in cluster]
        distances = [p[1] for p in cluster]
        
        min_angle = min(angles)
        max_angle = max(angles)
        arc_width = max_angle - min_angle
        
        # Handle wrap-around
        if arc_width > math.pi:
            arc_width = 2 * math.pi - arc_width
        
        center_angle = self._wrap_angle((min_angle + max_angle) / 2)
        min_distance = min(distances)
        
        return ObstacleZone(
            angle=center_angle,
            distance=min_distance,
            arc_width=arc_width,
            point_count=len(cluster),
        )
    
    @staticmethod
    def _wrap_angle(angle: float) -> float:
        """Wrap angle to [-pi, pi]."""
        return (angle + math.pi) % (2 * math.pi) - math.pi


__all__ = [
    "RobotFootprint",
    "ObstacleZone",
    "CollisionThreat", 
    "LidarObstacleDetector",
]

