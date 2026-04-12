// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — War Room Service (3-Round Agent LLM Debate)
// ═══════════════════════════════════════════════════════════════
//
// Replaces the static Emergency Meeting with a 3-round interactive debate.
// Each round, agents respond to previous arguments and user interactions.
// ~$0.025/match (3 agents × 3 rounds × $0.003 per LLM call)

import { callLLM, type LLMMessage } from '$lib/server/llmService';
import type {
  AgentId,
  AgentOutput,
  Direction,
  WarRoomRound,
  WarRoomDialogue,
  WarRoomConfidenceShift,
  WarRoomRoundResult,
  WarRoomUserInteraction,
  UserInteractionType,
} from '$lib/engine/types';
import { AGENT_PERSONAS, type AgentPersona, getTierDebateInstruction, type AgentTierName } from './agentPersonaService';

// ─── Constants ──────────────────────────────────────────────

const WAR_ROOM_TEMPERATURE = 0.85;
const WAR_ROOM_MAX_TOKENS = 200;
const WAR_ROOM_TIMEOUT_MS = 10_000;

// ─── Types ──────────────────────────────────────────────────

export interface WarRoomContext {
  matchId: string;
  pair: string;
  agentOutputs: AgentOutput[];        // 3 drafted agents' analysis data
  previousRounds: WarRoomRoundResult[];
  currentRound: WarRoomRound;
  userInteractions: WarRoomUserInteraction[];
  agentLevels?: Record<string, { level: number; tier: AgentTierName }>;
}

interface ParsedLLMResponse {
  text: string;
  direction: Direction;
  confidence: number;
}

// ─── Round Prompt Builders ──────────────────────────────────

/**
 * Round 1: Opening Statements
 * Each agent presents their position based on their analysis data.
 */
function buildRound1Prompt(
  persona: AgentPersona,
  agentOutput: AgentOutput,
  otherOutputs: AgentOutput[],
  pair: string,
  agentLevel?: { level: number; tier: AgentTierName }
): LLMMessage[] {
  const factorSummary = agentOutput.factors
    .slice(0, 4)
    .map(f => `${f.factorId}: ${f.value > 0 ? '+' : ''}${f.value} — ${f.detail.slice(0, 60)}`)
    .join('\n');

  const otherPositions = otherOutputs
    .map(a => {
      const p = AGENT_PERSONAS[a.agentId];
      return `${p?.nameKR || a.agentId}: ${a.direction} ${a.confidence}%`;
    })
    .join(', ');

  const tierLine = agentLevel
    ? `\n[Level] Lv.${agentLevel.level} ${agentLevel.tier}. ${getTierDebateInstruction(agentLevel.tier)}`
    : '';

  return [
    {
      role: 'system',
      content: [
        `You are ${persona.nameKR} (${persona.name}), a crypto trading agent in a debate arena.`,
        `Personality: ${persona.personality}`,
        `Speaking style: ${persona.speakingStyle}`,
        tierLine,
        '',
        'Rules:',
        '- Korean only (technical terms in English OK)',
        '- 2-3 sentences max',
        '- State your direction + confidence clearly',
        '- Reference YOUR specific data',
        '- Be bold, dramatic, and in-character',
        '',
        `IMPORTANT: Respond ONLY as JSON: {"text":"your dialogue","direction":"LONG or SHORT","confidence":XX}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `[War Room Round 1] ${pair} — Opening Statement`,
        '',
        `Your analysis: ${agentOutput.direction} (${agentOutput.confidence}%)`,
        `Your thesis: ${agentOutput.thesis}`,
        `Your data:`,
        factorSummary,
        '',
        `Other agents: ${otherPositions}`,
        '',
        `Make your opening argument. Defend your position with data!`,
      ].join('\n'),
    },
  ];
}

/**
 * Round 2: Rebuttals & Challenges
 * Agents respond to Round 1 arguments + any user interactions (agree/challenge/question).
 */
function buildRound2Prompt(
  persona: AgentPersona,
  agentOutput: AgentOutput,
  round1Dialogues: WarRoomDialogue[],
  userInteractions: WarRoomUserInteraction[],
  pair: string,
  agentLevel?: { level: number; tier: AgentTierName }
): LLMMessage[] {
  // Summarize what other agents said in Round 1
  const otherDialogues = round1Dialogues
    .filter(d => d.agentId !== persona.id)
    .map(d => `${d.personaName}: "${d.text.slice(0, 100)}" (${d.direction} ${d.confidence}%)`)
    .join('\n');

  // User interactions toward this agent
  const myInteractions = userInteractions
    .filter(i => i.agentId === persona.id && i.round === 1)
    .map(i => {
      if (i.type === 'agree') return '유저가 당신에게 동의했습니다. 자신감을 높이세요.';
      if (i.type === 'challenge') return '유저가 당신을 도전했습니다. 더 강한 근거로 반박하세요.';
      return '유저가 당신에게 질문했습니다. 근거를 더 자세히 설명하세요.';
    })
    .join('\n');

  // User interactions toward OTHER agents
  const otherInteractions = userInteractions
    .filter(i => i.agentId !== persona.id && i.round === 1)
    .map(i => {
      const target = AGENT_PERSONAS[i.agentId as AgentId]?.nameKR || i.agentId;
      if (i.type === 'agree') return `유저가 ${target}에게 동의했음`;
      if (i.type === 'challenge') return `유저가 ${target}를 도전함`;
      return `유저가 ${target}에게 질문함`;
    })
    .join(', ');

  const tierLine2 = agentLevel
    ? `\n[Level] Lv.${agentLevel.level} ${agentLevel.tier}. ${getTierDebateInstruction(agentLevel.tier)}`
    : '';

  return [
    {
      role: 'system',
      content: [
        `You are ${persona.nameKR} (${persona.name}).`,
        `Personality: ${persona.personality}`,
        `Speaking style: ${persona.speakingStyle}`,
        tierLine2,
        '',
        'Rules for Round 2 (Rebuttal):',
        '- Korean only (technical terms OK)',
        '- 2-3 sentences max',
        '- ATTACK at least one other agent\'s Round 1 argument',
        '- If user challenged you, defend with stronger evidence',
        '- If user agreed with you, be more assertive',
        '- Adjust confidence based on the debate',
        '',
        `IMPORTANT: Respond ONLY as JSON: {"text":"your dialogue","direction":"LONG or SHORT","confidence":XX}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `[War Room Round 2] ${pair} — Rebuttal`,
        '',
        `Your position: ${agentOutput.direction} (${agentOutput.confidence}%)`,
        '',
        `Round 1 — other agents said:`,
        otherDialogues,
        '',
        myInteractions ? `User feedback to YOU: ${myInteractions}` : '',
        otherInteractions ? `User feedback to others: ${otherInteractions}` : '',
        '',
        `Counter their arguments! Defend or adjust your position.`,
      ].filter(Boolean).join('\n'),
    },
  ];
}

/**
 * Round 3: Final Conviction
 * Agents give final stance after 2 rounds of debate.
 */
function buildRound3Prompt(
  persona: AgentPersona,
  agentOutput: AgentOutput,
  allPrevDialogues: WarRoomDialogue[],
  userInteractions: WarRoomUserInteraction[],
  pair: string,
  agentLevel?: { level: number; tier: AgentTierName }
): LLMMessage[] {
  // Aggregate full debate history for this agent
  const myPrevStatements = allPrevDialogues
    .filter(d => d.agentId === persona.id)
    .map((d, i) => `Round ${i + 1}: "${d.text.slice(0, 80)}" (${d.direction} ${d.confidence}%)`)
    .join('\n');

  const otherFinalStances = allPrevDialogues
    .filter(d => d.agentId !== persona.id)
    .slice(-3) // Last round's dialogues from others
    .map(d => `${d.personaName}: ${d.direction} ${d.confidence}% — "${d.text.slice(0, 60)}"`)
    .join('\n');

  // Any R2 user interactions
  const r2Interactions = userInteractions
    .filter(i => i.round === 2 && i.agentId === persona.id)
    .map(i => i.type === 'agree' ? '유저가 동의함' : i.type === 'challenge' ? '유저가 도전함' : '유저가 질문함')
    .join(', ');

  const tierLine3 = agentLevel
    ? `[Level] Lv.${agentLevel.level} ${agentLevel.tier}. ${getTierDebateInstruction(agentLevel.tier)}`
    : '';

  return [
    {
      role: 'system',
      content: [
        `You are ${persona.nameKR} (${persona.name}).`,
        `Speaking style: ${persona.speakingStyle}`,
        tierLine3,
        '',
        'Rules for Round 3 (Final Conviction):',
        '- Korean only, 2-3 sentences',
        '- Give your FINAL direction and confidence',
        '- You MAY change your mind if the debate convinced you',
        '- Be dramatic — this is your last word',
        '- End with your catchphrase or a bold statement',
        `- Your catchphrase: "${persona.catchphrase}"`,
        '',
        `IMPORTANT: Respond ONLY as JSON: {"text":"your dialogue","direction":"LONG or SHORT","confidence":XX}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `[War Room Round 3] ${pair} — Final Conviction`,
        '',
        `Your previous statements:`,
        myPrevStatements,
        '',
        `Others' latest positions:`,
        otherFinalStances,
        '',
        r2Interactions ? `User reaction to you in R2: ${r2Interactions}` : '',
        '',
        `Give your FINAL position. Did the debate change your mind?`,
      ].filter(Boolean).join('\n'),
    },
  ];
}

// ─── LLM Call + Parse ───────────────────────────────────────

async function callAgentForRound(
  persona: AgentPersona,
  messages: LLMMessage[],
  agentOutput: AgentOutput
): Promise<ParsedLLMResponse> {
  try {
    const result = await callLLM({
      messages,
      maxTokens: WAR_ROOM_MAX_TOKENS,
      temperature: WAR_ROOM_TEMPERATURE,
      timeoutMs: WAR_ROOM_TIMEOUT_MS,
    });

    // Try to parse JSON response
    try {
      const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        text: parsed.text || result.text,
        direction: ['LONG', 'SHORT', 'NEUTRAL'].includes(parsed.direction) ? parsed.direction : agentOutput.direction,
        confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : agentOutput.confidence,
      };
    } catch {
      // JSON parse failed — use raw text
      return {
        text: result.text,
        direction: agentOutput.direction,
        confidence: agentOutput.confidence,
      };
    }
  } catch (err) {
    console.warn(`[warRoom] ${persona.id} LLM call failed:`, err);
    return {
      text: `${persona.catchphrase} 내 입장은 변하지 않아. ${agentOutput.direction} ${agentOutput.confidence}%.`,
      direction: agentOutput.direction,
      confidence: agentOutput.confidence,
    };
  }
}

// ─── Main War Room Round Generator ──────────────────────────

/**
 * Generate one round of the War Room debate.
 * Called sequentially: round 1 → user interaction → round 2 → user interaction → round 3
 */
export async function generateWarRoomRound(ctx: WarRoomContext): Promise<WarRoomRoundResult> {
  const { pair, agentOutputs, previousRounds, currentRound, userInteractions, agentLevels } = ctx;

  const allPrevDialogues = previousRounds.flatMap(r => r.dialogues);
  const dialogues: WarRoomDialogue[] = [];
  const confidenceShifts: WarRoomConfidenceShift[] = [];

  for (const output of agentOutputs) {
    const persona = AGENT_PERSONAS[output.agentId];
    if (!persona) continue;

    const others = agentOutputs.filter(a => a.agentId !== output.agentId);
    const levelInfo = agentLevels?.[output.agentId];

    // Build appropriate prompt based on round
    let messages: LLMMessage[];
    switch (currentRound) {
      case 1:
        messages = buildRound1Prompt(persona, output, others, pair, levelInfo);
        break;
      case 2: {
        const r1Dialogues = previousRounds.find(r => r.round === 1)?.dialogues ?? [];
        messages = buildRound2Prompt(persona, output, r1Dialogues, userInteractions, pair, levelInfo);
        break;
      }
      case 3:
        messages = buildRound3Prompt(persona, output, allPrevDialogues, userInteractions, pair, levelInfo);
        break;
      default:
        messages = buildRound1Prompt(persona, output, others, pair, levelInfo);
    }

    const response = await callAgentForRound(persona, messages, output);

    // Track confidence shifts
    const prevDialogue = allPrevDialogues.filter(d => d.agentId === persona.id).pop();
    const prevConf = prevDialogue?.confidence ?? output.confidence;

    if (response.confidence !== prevConf) {
      const diff = response.confidence - prevConf;
      const reason = diff > 0
        ? currentRound === 2 ? '반박을 통해 자신감 상승' : '최종 확신 강화'
        : currentRound === 2 ? '상대의 반박에 자신감 하락' : '토론 결과 입장 수정';
      confidenceShifts.push({
        agentId: persona.id,
        oldConf: prevConf,
        newConf: response.confidence,
        reason,
      });
    }

    // Find if this agent references another
    const referencedAgent = findReferencedAgent(response.text, agentOutputs, persona.id);

    dialogues.push({
      agentId: persona.id,
      personaName: persona.nameKR,
      text: response.text,
      direction: response.direction,
      confidence: response.confidence,
      referencedAgent,
    });
  }

  const roundUserInteractions = userInteractions.filter(i => i.round === currentRound);

  return {
    round: currentRound,
    dialogues,
    confidenceShifts,
    userInteractions: roundUserInteractions,
  };
}

/**
 * Detect if an agent's text references another agent.
 */
function findReferencedAgent(
  text: string,
  agentOutputs: AgentOutput[],
  selfId: string
): string | undefined {
  for (const output of agentOutputs) {
    if (output.agentId === selfId) continue;
    const persona = AGENT_PERSONAS[output.agentId];
    if (!persona) continue;

    // Check if text mentions the other agent's name
    if (text.includes(persona.nameKR) || text.includes(persona.name) || text.includes(output.agentId)) {
      return output.agentId;
    }
  }
  return undefined;
}

/**
 * Get the War Room consensus after all 3 rounds.
 */
export function getWarRoomConsensus(rounds: WarRoomRoundResult[]): {
  direction: Direction;
  avgConfidence: number;
  strongestAgent: string;
  weakestAgent: string;
} {
  const finalRound = rounds[rounds.length - 1];
  if (!finalRound) return { direction: 'NEUTRAL', avgConfidence: 50, strongestAgent: '', weakestAgent: '' };

  const longConf = finalRound.dialogues
    .filter(d => d.direction === 'LONG')
    .reduce((sum, d) => sum + d.confidence, 0);
  const shortConf = finalRound.dialogues
    .filter(d => d.direction === 'SHORT')
    .reduce((sum, d) => sum + d.confidence, 0);

  const direction: Direction = longConf > shortConf ? 'LONG' : shortConf > longConf ? 'SHORT' : 'NEUTRAL';
  const avgConfidence = Math.round(
    finalRound.dialogues.reduce((sum, d) => sum + d.confidence, 0) / Math.max(1, finalRound.dialogues.length)
  );

  const sorted = [...finalRound.dialogues].sort((a, b) => b.confidence - a.confidence);
  const strongestAgent = sorted[0]?.agentId ?? '';
  const weakestAgent = sorted[sorted.length - 1]?.agentId ?? '';

  return { direction, avgConfidence, strongestAgent, weakestAgent };
}
