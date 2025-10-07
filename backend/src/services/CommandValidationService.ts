import { logger } from '../utils/logger';

/**
 * Command Validation Service
 * Implements T074a: Command conflict validation per FR-039
 * Prevents conflicting commands from being sent to the same robot simultaneously
 */

interface ActiveCommand {
  commandId: string;
  robotId: string;
  commandType: string;
  timestamp: Date;
  status: 'SENT' | 'ACKNOWLEDGED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
}

interface ConflictRule {
  commandType: string;
  conflictsWith: string[];
}

export class CommandValidationService {
  private activeCommands: Map<string, ActiveCommand[]> = new Map();
  
  // Define command conflict rules
  private conflictRules: ConflictRule[] = [
    {
      commandType: 'MOVE',
      conflictsWith: ['MOVE', 'SET_MODE', 'E_STOP'],
    },
    {
      commandType: 'SET_MODE',
      conflictsWith: ['MOVE', 'SET_MODE'],
    },
    {
      commandType: 'E_STOP',
      conflictsWith: [], // E-stop never conflicts - highest priority
    },
    {
      commandType: 'SET_SPEED',
      conflictsWith: [], // Speed changes don't conflict
    },
    {
      commandType: 'CONFIG_UPDATE',
      conflictsWith: [], // Config updates don't conflict
    },
    {
      commandType: 'CLEAR_ERRORS',
      conflictsWith: [], // Clearing errors doesn't conflict
    },
  ];

  /**
   * Validate if a command can be sent to a robot
   */
  public validateCommand(
    _commandId: string,
    robotId: string,
    commandType: string
  ): { valid: boolean; reason?: string; conflictingCommands?: string[] } {
    // E-stop always allowed (highest priority)
    if (commandType === 'E_STOP') {
      return { valid: true };
    }

    const activeRobotCommands = this.activeCommands.get(robotId) || [];
    const rule = this.conflictRules.find((r) => r.commandType === commandType);

    if (!rule) {
      logger.warn('Unknown command type', { commandType });
      return { valid: false, reason: 'UNKNOWN_COMMAND_TYPE' };
    }

    // Check for conflicts
    const conflicts = activeRobotCommands.filter(
      (cmd) =>
        cmd.status === 'SENT' ||
        cmd.status === 'ACKNOWLEDGED' ||
        cmd.status === 'EXECUTING'
    );

    const conflictingCommands = conflicts.filter((cmd) =>
      rule.conflictsWith.includes(cmd.commandType)
    );

    if (conflictingCommands.length > 0) {
      return {
        valid: false,
        reason: 'COMMAND_CONFLICT',
        conflictingCommands: conflictingCommands.map((c) => c.commandId),
      };
    }

    return { valid: true };
  }

  /**
   * Register a command as active
   */
  public registerCommand(
    commandId: string,
    robotId: string,
    commandType: string
  ): void {
    const activeRobotCommands = this.activeCommands.get(robotId) || [];

    // E-stop clears all other commands
    if (commandType === 'E_STOP') {
      this.activeCommands.set(robotId, []);
    }

    activeRobotCommands.push({
      commandId,
      robotId,
      commandType,
      timestamp: new Date(),
      status: 'SENT',
    });

    this.activeCommands.set(robotId, activeRobotCommands);
    this.cleanupOldCommands(robotId);

    logger.debug('Command registered', { commandId, robotId, commandType });
  }

  /**
   * Update command status
   */
  public updateCommandStatus(
    commandId: string,
    robotId: string,
    status: ActiveCommand['status']
  ): void {
    const activeRobotCommands = this.activeCommands.get(robotId);
    if (!activeRobotCommands) return;

    const command = activeRobotCommands.find((c) => c.commandId === commandId);
    if (command) {
      command.status = status;

      // Remove completed or failed commands
      if (status === 'COMPLETED' || status === 'FAILED') {
        const updatedCommands = activeRobotCommands.filter(
          (c) => c.commandId !== commandId
        );
        this.activeCommands.set(robotId, updatedCommands);
      }

      logger.debug('Command status updated', { commandId, robotId, status });
    }
  }

  /**
   * Clear all commands for a robot (used on disconnect)
   */
  public clearRobotCommands(robotId: string): void {
    this.activeCommands.delete(robotId);
    logger.debug('Robot commands cleared', { robotId });
  }

  /**
   * Get active commands for a robot
   */
  public getActiveCommands(robotId: string): ActiveCommand[] {
    return this.activeCommands.get(robotId) || [];
  }

  /**
   * Cleanup commands older than 30 seconds
   */
  private cleanupOldCommands(robotId: string): void {
    const activeRobotCommands = this.activeCommands.get(robotId);
    if (!activeRobotCommands) return;

    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30000);

    const filtered = activeRobotCommands.filter(
      (cmd) => cmd.timestamp > thirtySecondsAgo
    );

    if (filtered.length !== activeRobotCommands.length) {
      this.activeCommands.set(robotId, filtered);
      logger.debug('Old commands cleaned up', {
        robotId,
        removed: activeRobotCommands.length - filtered.length,
      });
    }
  }
}

// Singleton instance
export const commandValidationService = new CommandValidationService();

