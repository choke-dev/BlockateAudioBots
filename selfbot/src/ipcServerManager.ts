import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Selfbot from "./structures/client.js";

// Define the IPCMessage interface
export interface IPCMessage {
    type: string;
    data: any;
    socket?: net.Socket; // Store the socket for sending responses back
}

let server: net.Server | null = null;
let selfbotInstance: Selfbot | null = null;
let socketPath: string | null = null;

// Set up signal handlers for graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down IPC server...');
    await stopServer();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down IPC server...');
    await stopServer();
    process.exit(0);
});

/**
 * Sets the selfbot instance for emitting events
 * @param selfbot The selfbot client instance
 */
export function setSelfbotInstance(selfbot: Selfbot): void {
    selfbotInstance = selfbot;
}

/**
 * Starts the IPC server using Unix sockets.
 * @param socketPath Path to the Unix socket file (default: /tmp/blockate-audio-whitelisting.sock)
 * @param onConnection Optional callback for each incoming socket
 * @returns Promise that resolves once the server is listening
 */
export function startServer(
    socketPathArg: string = path.join(os.tmpdir(), "blockate-audio-whitelisting.sock"),
    onConnection?: (socket: net.Socket) => void
): Promise<void> {
    if (server) throw new Error("Server is already running");

    // Store the socket path for cleanup later
    socketPath = socketPathArg;

    // Remove the socket file if it exists (it might be stale)
    if (fs.existsSync(socketPath)) {
        try {
            fs.unlinkSync(socketPath);
            console.log(`Removed existing socket file: ${socketPath}`);
        } catch (unlinkErr) {
            console.warn(`Warning: Could not remove existing socket file: ${unlinkErr.message}`);
        }
    }

    server = net.createServer(onConnection ?? defaultHandler);

    server.on("error", (err) => {
        console.error("Server error:", err.message);
    });

    return new Promise((resolve, reject) => {
        if (!server) {
            reject(new Error("Server is not initialized"));
            return;
        }

        server.listen(socketPath, () => {
            console.log(`Server listening on Unix socket: ${socketPath}`);

            // Set appropriate permissions for the socket file
            try {
                if (socketPath) {
                    fs.chmodSync(socketPath, 0o666);
                }
            } catch (err) {
                console.warn(`Warning: Could not set socket permissions: ${err.message}`);
            }

            resolve();
        });
    });
}

/**
 * Stops the IPC server if it's running.
 * @returns Promise that resolves once the server is closed
 */
export function stopServer(): Promise<void> {
    if (!server) return Promise.resolve();

    return new Promise((resolve, reject) => {
        server!.close((err) => {
            if (err) reject(err);
            else {
                console.log("Server stopped");

                // Clean up the socket file
                if (socketPath) {
                    if (fs.existsSync(socketPath)) {
                        try {
                            fs.unlinkSync(socketPath);
                            console.log(`Removed socket file: ${socketPath}`);
                        } catch (unlinkErr) {
                            console.warn(`Warning: Could not remove socket file: ${unlinkErr.message}`);
                        }
                    }
                }

                server = null;
                socketPath = null;
                resolve();
            }
        });
    });
}

/** Default connection handler: processes JSON messages and emits events */
function defaultHandler(socket: net.Socket) {
    console.log(`Client connected to Unix socket`);

    socket.on("data", (data) => {
        try {
            // Parse the JSON message
            const msg = JSON.parse(data.toString().trim());

            // Validate message format
            if (!msg.type || typeof msg.type !== 'string') {
                socket.write(JSON.stringify({
                    type: 'error',
                    data: { message: 'Invalid message format: missing or invalid "type" field' }
                }) + '\n');
                return;
            }

            if (selfbotInstance) {
                // Add socket to the message for sending responses back
                const ipcMessage: IPCMessage = {
                    ...msg,
                    socket: socket
                };

                // Emit the ipcMessage event with the parsed message
                selfbotInstance.emit('ipcMessage', ipcMessage);

                // Log the received message
                console.log(`IPC message received: ${msg.type}`);
            } else {
                socket.write(JSON.stringify({
                    type: 'error',
                    data: { message: 'Selfbot instance not available' }
                }) + '\n');
            }
        } catch (error) {
            // Handle JSON parsing errors
            socket.write(JSON.stringify({
                type: 'error',
                data: { message: 'Invalid JSON format' }
            }) + '\n');
            console.error('Error parsing IPC message:', error);
        }
    });

    socket.on("end", () => console.log("Client disconnected"));
    socket.on("error", (err) => console.error("Socket error:", err.message));
}

/**
 * Sends a response back to the client
 * @param socket The client socket
 * @param response The response object to send
 */
export function sendResponse(socket: net.Socket, response: any): void {
    try {
        socket.write(JSON.stringify(response) + '\n');
    } catch (error) {
        console.error('Error sending IPC response:', error);
    }
}
