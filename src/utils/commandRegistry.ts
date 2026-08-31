export interface CommandDefinition {
  id: string;
  key: string;
  label: string;
  description: string;
  available?(): boolean;
  run(): void | Promise<void>;
}

/** A small registry keeps keyboard handlers and their help surfaces in sync. */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition) {
    this.commands.set(command.id, command);
    return () => this.commands.delete(command.id);
  }

  list() {
    return [...this.commands.values()].filter((command) => command.available?.() !== false);
  }

  async runKey(key: string) {
    const command = this.list().find((candidate) => candidate.key === key);
    if (!command) return false;
    await command.run();
    return true;
  }
}
