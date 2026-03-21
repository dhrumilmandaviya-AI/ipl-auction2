// src/lib/claude.js
// Calls Anthropic API directly using VITE_ANTHROPIC_API_KEY.
// Keep your GitHub repo private — the key is baked into the build.

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

export async function callClaude(params) {
  if (!API_KEY) throw new Error('VITE_ANTHROPIC_API_KEY not set. Add it to your .env and GitHub repo secrets.')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      ...params,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`)
  return data
}

export function callClaudeWithSearch(messages, maxTokens = 4000) {
  return callClaude({
    messages,
    max_tokens: maxTokens,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  })
}

export function extractText(data) {
  if (!data?.content) return ''
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

export function parseJSON(text) {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found in Claude response')
  return JSON.parse(match[0])
}
