export function llmConfig() {
  const baseURL = (process.env.LLM_BASE_URL || 'https://hackathon.bitgetops.com/v1').replace(
    /\/+$/,
    '',
  );
  const url = new URL(baseURL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw Error('LLM_INVALID_BASE_URL');
  const hackathon = url.hostname === 'hackathon.bitgetops.com';
  const model = process.env.LLM_MODEL || (hackathon ? 'qwen3.8-max' : 'qwen-plus');
  const api = process.env.LLM_API || (hackathon ? 'responses' : 'chat_completions');
  if (api !== 'responses' && api !== 'chat_completions') throw Error('LLM_INVALID_API');
  return {
    baseURL,
    model,
    api,
    // Only the older direct Alibaba chat models need this extension. The hackathon gateway and Qwen3.8 do not.
    extra:
      api === 'chat_completions' &&
      ['qwen-plus', 'qwen-turbo', 'qwen-flash'].includes(model) &&
      url.hostname.endsWith('.aliyuncs.com')
        ? { enable_thinking: false }
        : {},
  };
}
