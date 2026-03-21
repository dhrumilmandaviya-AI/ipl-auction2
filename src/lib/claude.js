// Routes all Claude calls through Supabase Edge Function
// API key lives in Supabase secrets — never exposed in browser
import { supabase } from './supabase'

export async function callClaude(params) {
  const { data, error } = await supabase.functions.invoke('claude-proxy', {
    body: {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      ...params,
    },
  })
  if (error) throw new Error(error.message || 'Claude proxy call failed')
  if (data?.error) throw new Error(data.error.message || 'Claude API error')
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
