import * as net from "net";

/**
 * Interface for IPC messages exchanged between the selfbot and external clients
 */
export interface IPCMessage {
    /**
     * The type of message (e.g., "whitelistAudio", "getStatus", "sendMessage")
     */
    type: string;

    /**
     * The data associated with the message (structure depends on message type)
     */
    data: any;

    /**
     * The socket connection for sending responses back (added internally)
     */
    socket?: net.Socket;
}