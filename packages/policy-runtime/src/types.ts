import type { DecisionSource, JsonObject, ReadSet } from '../../action-runtime/src/types';
export type PolicyHead = 'life' | 'tactical';
export interface ActionCandidate { id: string; action: string; actorId: string; targetId?: string; parameters: JsonObject; readSet: ReadSet; features: number[] }
export interface PolicySpec { schemaId: string; candidateSchemaId: string; featureHash: string; normalizerHash: string;
  heads: Record<PolicyHead, { stateDim: number; inputDim: number; layers: number[]; candidateLimit: number }> }
export interface PolicyInput { head: PolicyHead; schemaId: string; actorId: string; simTime: number; ruleHash: string; featureHash: string; normalizerHash: string;
  stateFeatures: number[]; candidates: ActionCandidate[]; knownLegalMask: boolean[]; truncatedCandidates: number }
export interface PolicyDecision { selectedCandidateId: string | null; rawScores: Record<string, number>; head: PolicyHead; source: DecisionSource;
  modelId: string | null; modelHash: string | null; latencyMs: number; truncatedCandidates: number }
export interface CandidateManifest { format: 'village-candidate-mlp-v4'; dtype: 'float32-le'; modelId: string; head: PolicyHead; schemaId: string; candidateSchemaId: string;
  featureHash: string; normalizerHash: string; ruleHashes: string[]; layers: number[]; sha256: string; kind: 'trained' | 'parity-fixture'; training?: { dataHash: string; reportHash: string } }
export interface LoadedCandidateModel { manifest: CandidateManifest; spec: PolicySpec; score(input: number[]): number }
