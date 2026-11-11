import { useCallback, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';
import { sanitizeToolOptions, TOOL_OPTIONS_KEY, type SetOption, type ToolOptions } from './toolOptions';

/** The options of every tool, saved on each change. */
export function useToolOptions(): [ToolOptions, SetOption] {
  const [options, setOptions] = useState<ToolOptions>(() => sanitizeToolOptions(loadJSON<unknown>(TOOL_OPTIONS_KEY, null)));
  useEffect(() => saveJSON(TOOL_OPTIONS_KEY, options), [options]);
  const set = useCallback<SetOption>((tool, patch) => setOptions((o) => ({ ...o, [tool]: { ...o[tool], ...patch } })), []);
  return [options, set];
}
