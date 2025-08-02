import SelfbotEvent from "../structures/event.js";
import { startServer, setSelfbotInstance } from "../ipcServerManager.js";

export default new SelfbotEvent({
  name: "ready",
  async run(selfbot) {
    selfbot.logger.info(`Connected as ${selfbot.user?.tag}`);

    // Initialize the IPC server if enabled in config
    if (selfbot.config.ipc?.enabled) {
      // Set the selfbot instance for emitting events
      setSelfbotInstance(selfbot);

      // Start the IPC server with Unix socket
      const socketPath = selfbot.config.ipc.socketPath;
      const maxRetries = 3;
      let retryCount = 0;

      const startIPCServer = async () => {
        try {
          // Use the configured socket path or default
          await startServer(socketPath);
          selfbot.logger.info(`IPC server started on Unix socket: ${socketPath}`);
        } catch (error) {
          selfbot.logger.error(`Failed to start IPC server: ${error.message}`);

          if (retryCount < maxRetries) {
            retryCount++;
            selfbot.logger.info(`Retrying IPC server start (${retryCount}/${maxRetries})...`);
            // Wait a bit before retrying
            setTimeout(startIPCServer, 1000);
          } else {
            selfbot.logger.error(`Maximum retry attempts reached. IPC server could not be started.`);
          }
        }
      };

      // Start the IPC server with retry mechanism
      await startIPCServer();
    }
  },
});
