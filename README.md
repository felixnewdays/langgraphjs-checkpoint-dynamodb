# LangGraph.js DynamoDB Checkpoint Saver

A DynamoDB-based checkpoint saver for LangGraph.js applications.

## Features

- **DynamoDB Integration**: Store checkpoints and writes in AWS DynamoDB
- **TTL Support**: Optional Time-To-Live (TTL) for automatic data expiration
- **Batch Operations**: Efficient batch writing for multiple operations
- **TypeScript Support**: Full TypeScript support with type definitions

## Installation

```bash
npm install langgraphjs-checkpoint-dynamodb
```

## Usage

### Basic Usage

```typescript
import { DynamoDBSaver } from 'langgraphjs-checkpoint-dynamodb';

const saver = new DynamoDBSaver({
    checkpointsTableName: 'my-checkpoints-table',
    writesTableName: 'my-writes-table',
    // Optional: AWS client configuration
    clientConfig: {
        region: 'us-east-1',
        // ... other AWS SDK options
    }
});
```

### With TTL (Time-To-Live)

You can configure TTL to automatically expire data after a specified duration:

```typescript
import { DynamoDBSaver } from 'langgraphjs-checkpoint-dynamodb';

const saver = new DynamoDBSaver({
    checkpointsTableName: 'my-checkpoints-table',
    writesTableName: 'my-writes-table',
    // TTL configuration - data will expire after 24 hours
    ttl: 24 * 60 * 60 // 24 hours in seconds
});
```

### TTL Examples

```typescript
// 1 hour TTL
const saver1 = new DynamoDBSaver({
    checkpointsTableName: 'checkpoints',
    writesTableName: 'writes',
    ttl: 3600
});

// 7 days TTL
const saver2 = new DynamoDBSaver({
    checkpointsTableName: 'checkpoints',
    writesTableName: 'writes',
    ttl: 7 * 24 * 60 * 60
});

// 30 minutes TTL
const saver3 = new DynamoDBSaver({
    checkpointsTableName: 'checkpoints',
    writesTableName: 'writes',
    ttl: 30 * 60
});
```

## DynamoDB Table Setup

### Checkpoints Table

```json
{
    "TableName": "checkpoints",
    "KeySchema": [
        {
            "AttributeName": "thread_id",
            "KeyType": "HASH"
        },
        {
            "AttributeName": "checkpoint_id",
            "KeyType": "RANGE"
        }
    ],
    "AttributeDefinitions": [
        {
            "AttributeName": "thread_id",
            "AttributeType": "S"
        },
        {
            "AttributeName": "checkpoint_id",
            "AttributeType": "S"
        }
    ],
    "BillingMode": "PAY_PER_REQUEST"
}
```

### Writes Table

```json
{
    "TableName": "writes",
    "KeySchema": [
        {
            "AttributeName": "thread_id_checkpoint_id_checkpoint_ns",
            "KeyType": "HASH"
        },
        {
            "AttributeName": "task_id_idx",
            "KeyType": "RANGE"
        }
    ],
    "AttributeDefinitions": [
        {
            "AttributeName": "thread_id_checkpoint_id_checkpoint_ns",
            "AttributeType": "S"
        },
        {
            "AttributeName": "task_id_idx",
            "AttributeType": "S"
        }
    ],
    "BillingMode": "PAY_PER_REQUEST"
}
```

### TTL Configuration

If you're using TTL, you'll need to enable TTL on your DynamoDB tables:

```bash
# For checkpoints table
aws dynamodb update-time-to-live \
    --table-name checkpoints \
    --time-to-live-specification "Enabled=true, AttributeName=ttl"

# For writes table
aws dynamodb update-time-to-live \
    --table-name writes \
    --time-to-live-specification "Enabled=true, AttributeName=ttl"
```

## API Reference

### DynamoDBSaver Constructor

```typescript
new DynamoDBSaver({
    clientConfig?: DynamoDBClientConfig;
    serde?: SerializerProtocol;
    checkpointsTableName: string;
    writesTableName: string;
    ttl?: number;
})
```

#### Parameters

- `clientConfig` (optional): AWS DynamoDB client configuration
- `serde` (optional): Serializer protocol for data serialization
- `checkpointsTableName` (required): Name of the DynamoDB table for checkpoints
- `writesTableName` (required): Name of the DynamoDB table for writes
- `ttl` (optional): TTL duration in seconds for automatic data expiration

## License

MIT
