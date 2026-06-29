// The adapter conformance suite — public entry point. Import `runConformance`
// and feed it a `ConformanceCase` per adapter (see ./README.md).
export {
  runConformance,
  type ConformanceCase,
  type DecodeExpectation,
  type RequestFacts,
} from './runner.js';
