#!/usr/bin/env node
/**
 * Script to query an indexed collection and get an answer
 */
import { ChatService } from '@/services/chat.js';

const COLLECTION_NAME = 'erpc-product-tenant-v1';
const QUERY = 'What is this repository all about? explain to me what kind of data this tenant processes and how it is structured';

async function main() {
  console.log('='.repeat(60));
  console.log('ANSWER TEST SCRIPT');
  console.log('='.repeat(60));
  console.log(`Collection: "${COLLECTION_NAME}"`);
  console.log(`Query: "${QUERY}"`);
  console.log('='.repeat(60));
  console.log();
  
  const service = new ChatService();
  const startedAt = Date.now();
  
  try {
    const result = await service.ask(COLLECTION_NAME, QUERY);
    const totalDuration = Date.now() - startedAt;
    
    console.log();
    console.log('='.repeat(60));
    console.log('ANSWER GENERATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`Total duration: ${totalDuration}ms`);
    console.log(`Answer length: ${result.answer.length} characters`);
    console.log(`Sources found: ${result.sources.length}`);
    console.log('='.repeat(60));
    console.log();
    console.log('=== ANSWER ===');
    console.log(result.answer);
    console.log();
    console.log('=== SOURCES ===');
    result.sources.forEach((source, index) => {
      console.log(`${index + 1}. ${source.filePath} (score: ${source.score.toFixed(4)})`);
    });
    console.log('='.repeat(60));
  } catch (error) {
    console.error();
    console.error('='.repeat(60));
    console.error('QUERY FAILED');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

main();
