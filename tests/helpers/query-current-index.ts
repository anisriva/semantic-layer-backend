import { queryIndex } from './query-index.js';

const questions = process.argv.slice(2);
const evaluationQuestions = questions.length > 0 ? questions : [
  'How are hybrid retrieval results converted into context before answer generation?',
  'Which rules enforce service and helper responsibilities?',
  'How are Markdown and Confluence documents preserved in semantic retrieval?',
];

for (const question of evaluationQuestions) {
  const result = await queryIndex(
    'semantic-layer-backend-verification',
    question,
  );
  console.log(JSON.stringify({
    answer: result.answer,
    indexedChunkCount: result.indexedChunkCount,
    question,
    sources: result.results.map((item) => item.chunk?.filePath ?? 'unknown'),
    stage: 'QUERY_ANSWER',
  }, null, 2));
}
