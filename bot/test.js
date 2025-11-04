const { createClient } = require('redis');

async function testPubSub() {
    // Use environment variables or defaults for testing
    const keydbUrl = process.env.KEYDB_URL
    const keydbPassword = process.env.KEYDB_PASSWORD
    
    const publisher = createClient({
        url: keydbUrl,
        ...(keydbPassword && { password: keydbPassword })
    });

    try {
        await publisher.connect();
        console.log('Connected to KeyDB');

        // Example whitelist request data
        const testRequest = {
            status: 'PENDING',
            updatedAt: new Date().toISOString(),
            category: 'REJECT ME!!!',
            name: 'REJECT ME!!!',
            audioId: 'test123',
            audioVisibility: 'PUBLIC',
            tags: ['test', 'example'],
            createdAt: new Date().toISOString(),
            requestId: 'req_test_123',
            requester: {
                roblox: {
                    username: 'TestUser',
                    id: '123456789'
                }
            },
            userId: 'user123',
            acknowledged: false,
            audioUrl: 'https://example.com/audio.ogg'
        };

        // Publish the test message
        await publisher.publish('audioRequests', JSON.stringify(testRequest));
        console.log('Published test message to audioRequests channel');

        await publisher.quit();
        console.log('Disconnected from KeyDB');
    } catch (error) {
        console.error('Error:', error);
    }
}

testPubSub();