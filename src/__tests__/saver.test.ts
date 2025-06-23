/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
    Checkpoint,
    CheckpointTuple,
    uuid6,
    CheckpointMetadata,
} from '@langchain/langgraph-checkpoint';
import { DynamoDBSaver } from '../saver';
import { MockDynamoDBDocument } from '../__mocks__/DynamoDBDocument.mock';
import { SerializerProtocol } from '@langchain/langgraph-checkpoint';
import type { PendingWrite } from '@langchain/langgraph-checkpoint';
import { expectErrorMessageToBeThrown } from './helpers/expectErrorMessageToBeThrown';

// Mock Serializer
class MockSerializer implements SerializerProtocol {
    dumpsTyped(value: any): [string, Uint8Array] {
        return ['json', new TextEncoder().encode(JSON.stringify(value))];
    }

    async loadsTyped(type: string, value: Uint8Array | string): Promise<any> {
        switch (type) {
            case 'json':
                return JSON.parse(
                    typeof value === 'string'
                        ? value
                        : new TextDecoder().decode(value)
                );
            default:
                throw new Error(`Unsupported type: ${type}`);
        }
    }
}

function createCheckpoint(num: number): Checkpoint {
    return {
        v: 1,
        id: uuid6(num),
        ts: `2024-04-${num + 18}T17:19:07.952Z`,
        channel_values: {
            someKey1: `someValue${num}`,
        },
        channel_versions: {
            someKey2: num,
        },
        versions_seen: {
            someKey3: {
                someKey4: num,
            },
        },
        pending_sends: [],
    };
}

const checkpoint1 = createCheckpoint(1);
const checkpoint2 = createCheckpoint(2);

const config1 = {
    configurable: { thread_id: '1' },
} as const;

describe('DynamoDBSaver', () => {
    describe('unit', () => {
        let saver: DynamoDBSaver;
        let mockDocClient: MockDynamoDBDocument;
        let serializer: MockSerializer;

        beforeEach(() => {
            mockDocClient = new MockDynamoDBDocument();
            serializer = new MockSerializer();

            // Initialize the DynamoDBSaver with the mock client
            saver = new DynamoDBSaver({
                clientConfig: {}, // Empty config since we're mocking
                serde: serializer,
                checkpointsTableName: 'Checkpoints',
                writesTableName: 'Writes',
            });

            // Replace the real docClient with the mock
            (saver as any).docClient = mockDocClient;
        });

        it('should save and retrieve checkpoints correctly', async () => {
            // Get undefined checkpoint
            const undefinedCheckpoint = await saver.getTuple(config1);
            expect(undefinedCheckpoint).toBeUndefined();

            // Save first checkpoint
            const runnableConfig = await saver.put(config1, checkpoint1, {
                source: 'update',
                step: -1,
                writes: null,
            } as CheckpointMetadata);
            expect(runnableConfig).toEqual({
                configurable: {
                    thread_id: '1',
                    checkpoint_ns: '',
                    checkpoint_id: checkpoint1.id,
                },
            });

            // Add some writes
            await saver.putWrites(
                {
                    configurable: {
                        thread_id: '1',
                        checkpoint_ns: '',
                        checkpoint_id: checkpoint1.id,
                    },
                },
                [['bar', 'baz']] as PendingWrite[],
                'foo'
            );

            // Get first checkpoint tuple
            const firstCheckpointTuple = await saver.getTuple(config1);
            expect(firstCheckpointTuple?.config).toEqual({
                configurable: {
                    thread_id: '1',
                    checkpoint_ns: '',
                    checkpoint_id: checkpoint1.id,
                },
            });
            expect(firstCheckpointTuple?.checkpoint).toEqual(checkpoint1);
            expect(firstCheckpointTuple?.parentConfig).toBeUndefined();
            expect(firstCheckpointTuple?.pendingWrites).toEqual([
                ['foo', 'bar', 'baz'],
            ]);

            const config1WithId = {
                configurable: {
                    thread_id: config1.configurable.thread_id,
                    checkpoint_ns: '',
                    checkpoint_id: '2024-04-18T17:19:07.952Z',
                },
            };

            // Save second checkpoint with parent_checkpoint_id
            await saver.put(config1WithId, checkpoint2, {
                source: 'update',
                step: -1,
                writes: null,
            } as CheckpointMetadata);

            // Verify that parentConfig is set and retrieved correctly for second checkpoint
            const secondCheckpointTuple = await saver.getTuple(config1);
            expect(secondCheckpointTuple?.parentConfig).toEqual(config1WithId);

            // List checkpoints
            const checkpointTuples: CheckpointTuple[] = [];
            for await (const checkpoint of saver.list(config1)) {
                checkpointTuples.push(checkpoint);
            }
            expect(checkpointTuples.length).toBe(2);

            const checkpointTuple1 = checkpointTuples[0];
            const checkpointTuple2 = checkpointTuples[1];
            expect(checkpointTuple1.checkpoint.ts).toBe(
                '2024-04-20T17:19:07.952Z'
            );
            expect(checkpointTuple2.checkpoint.ts).toBe(
                '2024-04-19T17:19:07.952Z'
            );
        });

        it('should throw an error when thread_id is missing in getTuple', async () => {
            const config = {
                configurable: {
                    checkpoint_id: 'checkpoint1',
                },
            };

            await expectErrorMessageToBeThrown(
                () => saver.getTuple(config),
                'Invalid thread_id'
            );
        });

        it('should throw an error when checkpoint_id is invalid in getTuple', async () => {
            const config = {
                configurable: {
                    thread_id: config1.configurable.thread_id,
                    checkpoint_id: 123, // Invalid type
                },
            };

            await expectErrorMessageToBeThrown(
                () => saver.getTuple(config),
                'Invalid checkpoint_id'
            );
        });

        it.skip('should throw an error when serializer returns unsupported type', async () => {
            // jest.spyOn(serializer, 'dumpsTyped').mockImplementation(() => ['unsupported', 'data']);
            // const config = {
            //   configurable: {
            //     thread_id: '1',
            //   },
            // };

            // await expectErrorMessageToBeThrown(
            //   () => saver.put(config, checkpoint1, {
            //     source: 'update',
            //     step: -1,
            //     writes: null,
            //   } as CheckpointMetadata),
            //   'Unsupported type'
            // );
        });

        it.skip('should handle deserialization errors gracefully in getTuple', async () => {
            // jest.spyOn(serializer, 'loadsTyped').mockImplementation(() => {
            //   throw new Error('Deserialization error');
            // });
            // const config = {
            //   configurable: {
            //     thread_id: '1',
            //   },
            // };
            // const checkpoint = { id: 'checkpoint1', data: 'some data' };
            // const metadata = { source: 'update', step: -1, writes: null } as CheckpointMetadata;
            // await saver.put(config, checkpoint, metadata);
            // await expect(saver.getTuple(config)).rejects.toThrow('Deserialization error');
        });

        it('should handle checkpoints with empty data', async () => {
            const config = {
                configurable: {
                    thread_id: '1',
                },
            };

            const checkpoint = { id: 'checkpoint1' } as Checkpoint;
            const metadata = {} as CheckpointMetadata;

            await saver.put(config, checkpoint, metadata);

            const retrieved = await saver.getTuple(config);
            expect(retrieved?.checkpoint).toEqual(checkpoint);
            expect(retrieved?.metadata).toEqual(metadata);
        });

        it('should handle checkpoints with null values', async () => {
            const config = {
                configurable: {
                    thread_id: '1',
                },
            };

            const checkpoint = {
                id: 'checkpoint1',
                data: null,
                channel_values: null,
            } as unknown as Checkpoint;
            const metadata = { source: null } as unknown as CheckpointMetadata;

            await saver.put(config, checkpoint, metadata);

            const retrieved = await saver.getTuple(config);
            expect(retrieved?.checkpoint).toEqual(checkpoint);
            expect(retrieved?.metadata).toEqual(metadata);
        });

        it('should handle item size limit exceeded error', async () => {
            // Create a large data payload
            const largeData = 'x'.repeat(500 * 1024); // 500 KB

            const config = {
                configurable: {
                    thread_id: '1',
                },
            };

            const checkpoint = {
                id: 'checkpoint1',
                data: largeData,
            } as unknown as Checkpoint;
            const metadata = {
                source: 'update',
                step: -1,
                writes: null,
            } as CheckpointMetadata;

            expectErrorMessageToBeThrown(
                () => saver.put(config, checkpoint, metadata),
                'Item size has exceeded the maximum allowed size'
            );
        });

        it('should handle special characters in keys and values', async () => {
            const config = {
                configurable: {
                    thread_id: 'thread-特殊字符',
                },
            };

            const checkpoint = {
                id: 'checkpoint-特殊字符',
                data: 'data with special characters: 特殊字符',
            } as unknown as Checkpoint;
            const metadata = {
                source: 'update',
                step: -1,
                writes: null,
            } as CheckpointMetadata;

            await saver.put(config, checkpoint, metadata);

            const retrieved = await saver.getTuple(config);
            expect(retrieved?.checkpoint).toEqual(checkpoint);
            expect(retrieved?.metadata).toEqual(metadata);
        });

        it('should set TTL when configured', async () => {
            const ttlSaver = new DynamoDBSaver({
                clientConfig: {},
                serde: serializer,
                checkpointsTableName: 'Checkpoints',
                writesTableName: 'Writes',
                ttl: 3600, // 1 hour TTL
            });

            // Replace the real docClient with the mock
            (ttlSaver as any).docClient = mockDocClient;

            // Save checkpoint with TTL
            await ttlSaver.put(config1, checkpoint1, {
                source: 'update',
                step: -1,
                writes: null,
            } as CheckpointMetadata);

            // Retrieve the saved item to verify TTL was set
            const savedItem = await mockDocClient.get({
                TableName: 'Checkpoints',
                Key: {
                    thread_id: '1',
                    checkpoint_id: checkpoint1.id,
                },
            });

            expect(savedItem.Item).toBeDefined();
            expect(savedItem.Item.ttl).toBeDefined();
            expect(typeof savedItem.Item.ttl).toBe('number');

            // Verify TTL is a reasonable future timestamp (within 1 hour + 5 seconds)
            const ttlValue = savedItem.Item.ttl;
            const now = Math.floor(Date.now() / 1000);
            expect(ttlValue).toBeGreaterThan(now);
            expect(ttlValue).toBeLessThanOrEqual(now + 3605); // 1 hour + 5 seconds buffer
        });

        it('should set TTL for writes when configured', async () => {
            const ttlSaver = new DynamoDBSaver({
                clientConfig: {},
                serde: serializer,
                checkpointsTableName: 'Checkpoints',
                writesTableName: 'Writes',
                ttl: 1800, // 30 minutes TTL
            });

            // Replace the real docClient with the mock
            (ttlSaver as any).docClient = mockDocClient;

            // Save writes with TTL
            await ttlSaver.putWrites(
                {
                    configurable: {
                        thread_id: '1',
                        checkpoint_ns: '',
                        checkpoint_id: 'test-checkpoint',
                    },
                },
                [['bar', 'baz']] as PendingWrite[],
                'foo'
            );

            // Query the writes table to verify TTL was set
            const writesResult = await mockDocClient.query({
                TableName: 'Writes',
                KeyConditionExpression: 'thread_id_checkpoint_id_checkpoint_ns = :thread_id_checkpoint_id_checkpoint_ns',
                ExpressionAttributeValues: {
                    ':thread_id_checkpoint_id_checkpoint_ns': '1:::test-checkpoint:::',
                },
            });

            expect(writesResult.Items).toBeDefined();
            expect(writesResult.Items!.length).toBeGreaterThan(0);

            const writeItem = writesResult.Items![0];
            expect(writeItem.ttl).toBeDefined();
            expect(typeof writeItem.ttl).toBe('number');

            // Verify TTL is a reasonable future timestamp (within 30 minutes + 5 seconds)
            const ttlValue = writeItem.ttl;
            const now = Math.floor(Date.now() / 1000);
            expect(ttlValue).toBeGreaterThan(now);
            expect(ttlValue).toBeLessThanOrEqual(now + 1805); // 30 minutes + 5 seconds buffer
        });
    });
});
