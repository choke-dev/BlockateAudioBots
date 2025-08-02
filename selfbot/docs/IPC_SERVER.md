# Discord Selfbot IPC Server

This document explains how to use the IPC (Inter-Process Communication) server feature of the Discord selfbot.

## Overview

The IPC server allows other applications to communicate with the Discord selfbot by sending and receiving messages over a Unix socket connection. This enables integration with other systems and automation of Discord interactions.

## Configuration

The IPC server is configured in the `config.json` file:

```json
{
  "prefix": ">",
  "ipc": {
    "enabled": true,
    "socketPath": "/tmp/blockate-audio-selfbot.sock"
  }
}
```

- `enabled`: Set to `true` to enable the IPC server, `false` to disable it
- `socketPath`: The path to the Unix socket file (default: `/tmp/blockate-audio-selfbot.sock`)

## Message Format

All messages sent to and from the IPC server must follow this JSON format:

```json
{
  "type": "messageType",
  "data": {
    // Message-specific data
  }
}
```

- `type`: A string identifying the type of message
- `data`: An object containing the message data (structure depends on the message type)

## Supported Message Types

### Sending a Discord Message

To send a message to a Discord channel:

```json
{
  "type": "sendMessage",
  "data": {
    "channelId": "123456789012345678",
    "content": "Hello from IPC client!"
  }
}
```

- `channelId`: The ID of the Discord channel to send the message to
- `content`: The content of the message to send

### Getting Selfbot Status

To request the current status of the selfbot:

```json
{
  "type": "getStatus",
  "data": {}
}
```

The server will respond with:

```json
{
  "type": "statusResponse",
  "data": {
    "online": true,
    "username": "Username#1234",
    "uptime": 3600000,
    "guilds": 10
  }
}
```

- `online`: Whether the selfbot is online
- `username`: The username and discriminator of the selfbot
- `uptime`: The uptime of the selfbot in milliseconds
- `guilds`: The number of guilds (servers) the selfbot is in

## Example Client

An example client implementation is provided in `examples/ipc-client.js`. To use it:

1. Install Node.js if you haven't already
2. Edit the file to set your channel ID
3. Run the client with `node examples/ipc-client.js`

## Creating Your Own Client

You can create your own client in any programming language that supports Unix socket connections. Here's a basic example in Python:

```python
import socket
import json
import time

# Configuration
SOCKET_PATH = '/tmp/blockate-audio-selfbot.sock'

# Create a socket
client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

# Connect to the server
client.connect(SOCKET_PATH)
print(f"Connected to IPC server at {SOCKET_PATH}")

# Send a message
message = {
    "type": "sendMessage",
    "data": {
        "channelId": "YOUR_CHANNEL_ID_HERE",
        "content": "Hello from Python IPC client!"
    }
}

client.send(json.dumps(message).encode())
print("Message sent")

# Wait for response
time.sleep(2)

# Close the connection
client.close()
print("Connection closed")
```

### Node.js Client Example

```javascript
const net = require('net');

// Configuration
const SOCKET_PATH = '/tmp/blockate-audio-selfbot.sock';

// Create a socket
const client = net.createConnection({ path: SOCKET_PATH }, () => {
  console.log(`Connected to IPC server at ${SOCKET_PATH}`);
  
  // Send a message
  const message = {
    type: "sendMessage",
    data: {
      channelId: "YOUR_CHANNEL_ID_HERE",
      content: "Hello from Node.js IPC client!"
    }
  };
  
  client.write(JSON.stringify(message) + '\n');
  console.log("Message sent");
});

client.on('data', (data) => {
  console.log('Received response:', data.toString());
  client.end();
});

client.on('end', () => {
  console.log('Connection closed');
});

client.on('error', (err) => {
  console.error('Connection error:', err);
});
```

## Security Considerations

The IPC server accepts connections from any client that can access the Unix socket file. For security reasons:

1. Only enable the IPC server when needed
2. Set appropriate file permissions on the socket file
3. Consider implementing authentication for sensitive operations
4. Be aware that Unix sockets are generally more secure than TCP sockets as they're limited to the local machine by default
5. If you need remote access, consider using SSH tunneling or a secure proxy