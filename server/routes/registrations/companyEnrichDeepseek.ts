import type { Express } from "express";
import { storage } from "../../storage";
import type { AuthedRequest } from "../../auth/middleware";

export function registerCompanyEnrichDeepseek(app: Express): void {
  app.post("/api/companies/:id/enrich-deepseek", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const id = parseInt(String(req.params.id));
      const { companyName, country, model } = req.body;

      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }

      // Guard org ownership before enriching.
      const existing = await storage.getCompany(id, orgId);
      if (!existing) return res.status(404).json({ error: "Company not found" });

      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openrouterApiKey) {
        return res.status(400).json({
          error: "OpenRouter API key not configured",
          message: "Please add OPENROUTER_API_KEY to your secrets"
        });
      }

      const selectedModel = model || 'openrouter/free';
      console.log(`[AI Enrich] Researching company: ${companyName} (${country || 'Unknown'}) with model: ${selectedModel}`);

      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://replit.com',
          'X-Title': 'Global Talent Map'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: `You are a business research analyst with deep knowledge of global companies. Research and provide accurate, factual information about companies.

Return ONLY valid JSON (no markdown code blocks, just raw JSON) with these fields:
- summary: A 2-4 sentence description of the company including what they do, their market position, and key facts
- coreActivity: What the company primarily does (1-2 sentences describing their main business)
- operatingModel: How the company operates - B2B, B2C, franchise, direct sales, etc. (1-2 sentences)
- revenueDrivers: Main sources of revenue - products, services, subscriptions, etc. (1-2 sentences)

Be accurate and factual. If you're not confident about specific information, provide what you know and note any uncertainty. Do not make up information.`
            },
            {
              role: 'user',
              content: `Research this company and provide business profile information:

Company Name: ${companyName}
Country/Region: ${country || 'Unknown'}

Please provide a comprehensive business profile as JSON. Remember: return ONLY raw JSON, no markdown formatting.`
            }
          ]
        })
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[DeepSeek API] Error:', errorText);
        return res.status(500).json({ error: "DeepSeek API request failed", message: errorText });
      }

      const aiData = await aiResponse.json();

      let enrichedInfo;
      try {
        let content = aiData.choices[0].message.content;
        // Remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        enrichedInfo = JSON.parse(content);
      } catch (parseError) {
        console.error('[AI Enrich] Failed to parse response:', aiData.choices[0].message.content);
        return res.status(500).json({ error: "Failed to parse AI response - model may not support structured output" });
      }

      await storage.updateCompanyManual(id, {
        summary: enrichedInfo.summary || null,
        coreActivity: enrichedInfo.coreActivity || null,
        operatingModel: enrichedInfo.operatingModel || null,
        revenueDrivers: enrichedInfo.revenueDrivers || null
      }, orgId);

      console.log(`[DeepSeek Enrich] Successfully enriched: ${companyName}`);
      res.json(enrichedInfo);
    } catch (error) {
      console.error("Error enriching with DeepSeek:", error);
      res.status(500).json({ error: "Failed to enrich with DeepSeek", message: String(error) });
    }
  });
}
