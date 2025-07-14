/**
 * Test blockchain connectivity and event scanning
 * This tests the core blockchain functionality without requiring API keys
 */

import { ethers } from 'ethers';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🧪 Testing blockchain connectivity...');

    try {
        const {
            RPC_URL,
            CONTRACT_ADDRESS,
            PRIVATE_KEY
        } = process.env;

        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            tests: {}
        };

        // Test 1: Environment Variables
        console.log('🧪 Test 1: Environment Variables');
        result.tests.environment = {
            RPC_URL: RPC_URL ? '✅ Set' : '❌ Missing',
            CONTRACT_ADDRESS: CONTRACT_ADDRESS ? '✅ Set' : '❌ Missing',
            PRIVATE_KEY: PRIVATE_KEY ? '✅ Set' : '❌ Missing'
        };

        if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY) {
            result.tests.environment.status = '❌ Missing required environment variables';
            return res.status(500).json(result);
        }

        // Test 2: Blockchain Connection
        console.log('🧪 Test 2: Blockchain Connection');
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const blockNumber = await provider.getBlockNumber();
            const network = await provider.getNetwork();
            
            result.tests.blockchain = {
                status: '✅ Connected',
                blockNumber,
                chainId: network.chainId.toString(),
                networkName: network.name || 'unknown'
            };
            
            console.log(`✅ Connected to blockchain (Block: ${blockNumber}, Chain: ${network.chainId})`);
        } catch (blockchainError) {
            result.tests.blockchain = {
                status: '❌ Failed',
                error: blockchainError.message
            };
            console.error('❌ Blockchain connection failed:', blockchainError);
        }

        // Test 3: Contract Connection
        console.log('🧪 Test 3: Contract Connection');
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const signer = new ethers.Wallet(PRIVATE_KEY, provider);
            
            const abi = [
                'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
                'function tokenURI(uint256) view returns (string)',
                'function setTokenURI(uint256,string)'
            ];
            
            const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
            const eventSig = nft.interface.getEvent('MintRequested').topicHash;
            
            result.tests.contract = {
                status: '✅ Connected',
                address: CONTRACT_ADDRESS,
                eventSignature: eventSig,
                signerAddress: signer.address
            };
            
            console.log(`✅ Contract connected (${CONTRACT_ADDRESS})`);
            console.log(`✅ Event signature: ${eventSig}`);
        } catch (contractError) {
            result.tests.contract = {
                status: '❌ Failed',
                error: contractError.message
            };
            console.error('❌ Contract connection failed:', contractError);
        }

        // Test 4: Event Scanning (last 100 blocks)
        console.log('🧪 Test 4: Event Scanning');
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const nft = new ethers.Contract(CONTRACT_ADDRESS, [
                'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)'
            ], provider);
            
            const eventSig = nft.interface.getEvent('MintRequested').topicHash;
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100);
            
            // Try to get events from last 100 blocks
            const logs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                fromBlock,
                toBlock: currentBlock,
                topics: [eventSig]
            });
            
            const events = [];
            for (const log of logs) {
                try {
                    const parsedLog = nft.interface.parseLog(log);
                    events.push({
                        tokenId: parsedLog.args.tokenId.toString(),
                        buyer: parsedLog.args.buyer,
                        breed: parsedLog.args.breed,
                        blockNumber: log.blockNumber,
                        transactionHash: log.transactionHash
                    });
                } catch (parseError) {
                    console.warn('Failed to parse log:', parseError);
                }
            }
            
            result.tests.eventScanning = {
                status: '✅ Working',
                blocksScanned: currentBlock - fromBlock,
                fromBlock,
                toBlock: currentBlock,
                eventsFound: events.length,
                events: events.slice(0, 5) // Show first 5 events
            };
            
            console.log(`✅ Event scanning working (${events.length} events found)`);
        } catch (scanError) {
            result.tests.eventScanning = {
                status: '❌ Failed',
                error: scanError.message
            };
            console.error('❌ Event scanning failed:', scanError);
        }

        console.log('🧪 Blockchain test completed:', result);
        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ Blockchain test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}