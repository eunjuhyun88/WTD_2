export interface SearchQueryNumericBounds {
	min?: number;
	max?: number;
}

export interface SearchQueryPhase {
	phase_id: string;
	label: string;
	sequence_order: number;
	required_numeric?: Record<string, SearchQueryNumericBounds>;
	required_boolean?: Record<string, boolean>;
	preferred_numeric?: Record<string, SearchQueryNumericBounds>;
	preferred_boolean?: Record<string, boolean>;
	forbidden_numeric?: Record<string, SearchQueryNumericBounds>;
	forbidden_boolean?: Record<string, boolean>;
	max_gap_bars?: number | null;
}

export interface SearchQueryTransformerMeta {
	transformer_version: string;
	signal_vocab_version: string;
	rule_registry_version: string;
}

export interface SearchQuerySpec {
	schema_version: number;
	pattern_family: string;
	reference_timeframe: string;
	phase_path: string[];
	phase_queries: SearchQueryPhase[];
	must_have_signals: string[];
	preferred_timeframes: string[];
	exclude_patterns: string[];
	similarity_focus: string[];
	symbol_scope: string[];
	transformer_meta: SearchQueryTransformerMeta;
}
