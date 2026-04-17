import {
  computeDedupeHash as computeLocalDedupeHash,
  computeQuickTradeEmbedding as computeLocalQuickTradeEmbedding,
  computeSignalActionEmbedding as computeLocalSignalActionEmbedding,
  computeTerminalScanEmbedding as computeLocalTerminalScanEmbedding,
} from './local/rag';
import { getEngineRuntimeMode } from './config';
import { engine } from '$lib/server/engineClient';

export async function computeTerminalScanEmbedding(
  ...args: Parameters<typeof computeLocalTerminalScanEmbedding>
): Promise<ReturnType<typeof computeLocalTerminalScanEmbedding>> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return computeLocalTerminalScanEmbedding(...args);
    case 'remote':
      return (await engine.ragTerminalScanEmbedding(args[0], args[1], args[2])).embedding;
  }
}

export async function computeQuickTradeEmbedding(
  ...args: Parameters<typeof computeLocalQuickTradeEmbedding>
): Promise<ReturnType<typeof computeLocalQuickTradeEmbedding>> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return computeLocalQuickTradeEmbedding(...args);
    case 'remote':
      return (await engine.ragQuickTradeEmbedding(args[0] as never)).embedding;
  }
}

export async function computeSignalActionEmbedding(
  ...args: Parameters<typeof computeLocalSignalActionEmbedding>
): Promise<ReturnType<typeof computeLocalSignalActionEmbedding>> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return computeLocalSignalActionEmbedding(...args);
    case 'remote':
      return (await engine.ragSignalActionEmbedding(args[0] as never)).embedding;
  }
}

export async function computeDedupeHash(
  ...args: Parameters<typeof computeLocalDedupeHash>
): Promise<ReturnType<typeof computeLocalDedupeHash>> {
  switch (getEngineRuntimeMode()) {
    case 'local':
      return computeLocalDedupeHash(...args);
    case 'remote':
      return (await engine.ragDedupeHash({
        pair: args[0].pair,
        timeframe: args[0].timeframe,
        direction: args[0].direction,
        regime: args[0].regime,
        source: args[0].source,
        windowMinutes: args[0].windowMinutes,
      })).dedupeHash;
  }
}
