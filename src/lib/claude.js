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
  // Strip markdown code fences
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  // Try array first, then object
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  const match = arrMatch || objMatch
  if (!match) throw new Error(`No JSON found. Claude said: ${cleaned.slice(0, 200)}`)
  try {
    return JSON.parse(match[0])
  } catch (e) {
    throw new Error(`JSON parse failed. Got: ${match[0].slice(0, 200)}`)
  }
}
