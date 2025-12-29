import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const keys = await kv.keys('item:*');
      const items = await Promise.all(
        keys.map(async (key) => {
          const item = await kv.get(key);
          return item;
        })
      );
      return res.status(200).json({ 
        success: true, 
        items: items.filter(i => i !== null).sort((a, b) => b.timestamp - a.timestamp)
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { text, apiKey } = req.body;

      if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
      }

      const categorized = await categorizeWithAI(text, apiKey);

      const newItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        rawInput: text,
        status: 'new',
        ...categorized
      };

      await kv.set(`item:${newItem.id}`, newItem);

      return res.status(200).json({ 
        success: true, 
        item: newItem,
        message: 'Item captured successfully'
      });

    } catch (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function categorizeWithAI(text, apiKey) {
  const workDomains = ['Fundraising', 'Operations', 'IT / Data Warehouse'];
  const personalDomains = ['418 Pacheco', 'Arboleda', 'Fitness', 'Photography', 'Other'];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Analyze this input and categorize it. Return ONLY a JSON object with this exact structure:
{
  "type": "work" or "personal",
  "domain": "one of the domains listed below",
  "title": "brief title",
  "description": "full description",
  "priority": "high", "medium", or "low",
  "actionable": true or false,
  "dueDate": "if mentioned, format as YYYY-MM-DD, otherwise null"
}

WORK DOMAINS: ${workDomains.join(', ')}
PERSONAL DOMAINS: ${personalDomains.join(', ')}

Input to categorize: "${text}"

Return ONLY the JSON object, no other text.`
          }
        ],
      })
    });

    const data = await response.json();
    const responseText = data.content[0].text.trim();
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);

  } catch (error) {
    console.error('AI categorization failed:', error);
    return {
      type: 'personal',
      domain: 'Other',
      title: text.substring(0, 50),
      description: text,
      priority: 'medium',
      actionable: true,
      dueDate: null
    };
  }
}
